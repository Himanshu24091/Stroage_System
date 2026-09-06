import os
import io
import zipfile
import tempfile
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, abort, g, send_file, after_this_request
from app import db
from app.utils.db_models import User, Folder, FileItem
from app.utils.auth_guard import require_login
from app.utils.drive_streamer import resolve_google_drive_stream
from app.utils.google_drive_api import delete_drive_file, is_google_api_configured, get_or_create_app_folder_in_drive, rename_drive_item
from app.utils.gas_bridge import delete_file_from_gas

folder_bp = Blueprint("folder_bp", __name__)

def _get_current_uid():
    """Resolve current authenticated user ID, accounting for superadmin proxy"""
    uid = getattr(g.current_user, "id", None)
    if uid == 0 or getattr(g.current_user, "is_admin", False):
        return 0
    return uid

@folder_bp.route("", methods=["GET"])
@require_login
def list_folders():
    """List folders for current user, filtered by parent_id or view state"""
    uid = _get_current_uid()
    is_admin = (uid == 0)
    view = request.args.get("view", "vault").lower()  # vault, starred, trash
    parent_id_raw = request.args.get("parent_id", None)

    query = Folder.query
    if not is_admin:
        query = query.filter((Folder.user_id == uid) | (Folder.user_id.is_(None)))

    if view == "trash":
        query = query.filter(Folder.is_trashed == True)
    elif view == "starred":
        query = query.filter(Folder.is_starred == True, Folder.is_trashed == False)
    else:
        # Standard vault view: only show non-trashed
        query = query.filter(Folder.is_trashed == False)
        if parent_id_raw is not None and parent_id_raw != "" and parent_id_raw != "root" and parent_id_raw != "null":
            try:
                parent_id = int(parent_id_raw)
                query = query.filter(Folder.parent_id == parent_id)
            except ValueError:
                query = query.filter(Folder.parent_id.is_(None))
        else:
            query = query.filter(Folder.parent_id.is_(None))

    folders = query.order_by(Folder.name.asc()).all()
    
    # Calculate current path if inside a specific folder
    current_folder = None
    breadcrumbs = [{"id": None, "name": "My Vault"}]
    if parent_id_raw and parent_id_raw not in ("root", "null", ""):
        try:
            cf = Folder.query.get(int(parent_id_raw))
            if cf:
                current_folder = cf.to_dict()
                breadcrumbs.extend(cf.get_path())
        except (ValueError, TypeError):
            pass

    return jsonify({
        "success": True,
        "count": len(folders),
        "folders": [f.to_dict() for f in folders],
        "current_folder": current_folder,
        "breadcrumbs": breadcrumbs
    }), 200

@folder_bp.route("", methods=["POST"])
@require_login
def create_folder():
    """Create a new folder"""
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    color = data.get("color", "blue").strip().lower()
    parent_id = data.get("parent_id")

    if not name:
        return jsonify({"success": False, "error": "Folder name is required"}), 400

    # Sanitize invalid characters
    name = name.replace("/", "-").replace("\\", "-")
    if len(name) > 100:
        name = name[:100]

    uid = _get_current_uid()
    if uid == 0:
        first_user = User.query.first()
        target_uid = first_user.id if first_user else 1
    else:
        target_uid = uid

    if parent_id:
        try:
            parent_id = int(parent_id)
            parent = Folder.query.get(parent_id)
            if not parent:
                parent_id = None
        except (ValueError, TypeError):
            parent_id = None

    valid_colors = {"blue", "purple", "emerald", "amber", "rose", "indigo", "cyan"}
    if color not in valid_colors:
        color = "blue"

    folder = Folder(
        user_id=target_uid,
        name=name,
        parent_id=parent_id,
        color=color,
        is_starred=False,
        is_trashed=False
    )
    db.session.add(folder)
    db.session.commit()

    # Sync folder creation to Google Drive in user's directory hierarchy
    if is_google_api_configured():
        try:
            target_user = User.query.get(target_uid) if target_uid else g.current_user
            get_or_create_app_folder_in_drive(folder, user=target_user)
        except Exception as drive_err:
            print(f"[GOOGLE DRIVE] Sync folder creation error: {drive_err}")

    return jsonify({
        "success": True,
        "message": f"Folder '{name}' created successfully",
        "folder": folder.to_dict()
    }), 201

@folder_bp.route("/<int:folder_id>/rename", methods=["PUT"])
@require_login
def rename_folder(folder_id):
    """Rename an existing folder"""
    folder = Folder.query.get_or_404(folder_id)
    uid = _get_current_uid()
    if uid != 0 and folder.user_id != uid:
        abort(403)

    data = request.get_json() or {}
    new_name = data.get("name", "").strip()
    if not new_name:
        return jsonify({"success": False, "error": "Folder name cannot be empty"}), 400

    new_name = new_name.replace("/", "-").replace("\\", "-")[:100]
    folder.name = new_name
    db.session.commit()

    # Sync folder rename to Google Drive
    if is_google_api_configured() and getattr(folder, "drive_folder_id", None):
        try:
            rename_drive_item(folder.drive_folder_id, new_name)
        except Exception as e:
            print(f"[GOOGLE DRIVE] Sync rename error: {e}")

    return jsonify({
        "success": True,
        "message": f"Folder renamed to '{new_name}'",
        "folder": folder.to_dict()
    }), 200

@folder_bp.route("/<int:folder_id>/color", methods=["PUT"])
@require_login
def update_folder_color(folder_id):
    """Change folder accent color"""
    folder = Folder.query.get_or_404(folder_id)
    uid = _get_current_uid()
    if uid != 0 and folder.user_id != uid:
        abort(403)

    data = request.get_json() or {}
    color = data.get("color", "blue").strip().lower()
    valid_colors = {"blue", "purple", "emerald", "amber", "rose", "indigo", "cyan"}
    if color in valid_colors:
        folder.color = color
        db.session.commit()

    return jsonify({
        "success": True,
        "message": "Folder color updated",
        "folder": folder.to_dict()
    }), 200

@folder_bp.route("/<int:folder_id>/star", methods=["PUT"])
@require_login
def toggle_star_folder(folder_id):
    """Toggle star/favorite status for folder"""
    folder = Folder.query.get_or_404(folder_id)
    uid = _get_current_uid()
    if uid != 0 and folder.user_id != uid:
        abort(403)

    folder.is_starred = not folder.is_starred
    db.session.commit()

    status_str = "starred" if folder.is_starred else "unstarred"
    return jsonify({
        "success": True,
        "message": f"Folder {status_str}",
        "is_starred": folder.is_starred
    }), 200

def _set_folder_trashed_recursive(folder, is_trashed=True):
    """Recursively mark folder, subfolders, and files as trashed or restored"""
    folder.is_trashed = is_trashed
    for file in folder.files:
        file.is_trashed = is_trashed
    for sub in folder.subfolders:
        _set_folder_trashed_recursive(sub, is_trashed)

@folder_bp.route("/<int:folder_id>/trash", methods=["PUT"])
@require_login
def trash_folder(folder_id):
    """Move folder and all its contents to Recycle Bin"""
    folder = Folder.query.get_or_404(folder_id)
    uid = _get_current_uid()
    if uid != 0 and folder.user_id != uid:
        abort(403)

    _set_folder_trashed_recursive(folder, is_trashed=True)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"Folder '{folder.name}' moved to Trash"
    }), 200

@folder_bp.route("/<int:folder_id>/restore", methods=["PUT"])
@require_login
def restore_folder(folder_id):
    """Restore folder and all its contents from Recycle Bin"""
    folder = Folder.query.get_or_404(folder_id)
    uid = _get_current_uid()
    if uid != 0 and folder.user_id != uid:
        abort(403)

    _set_folder_trashed_recursive(folder, is_trashed=False)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"Folder '{folder.name}' restored successfully"
    }), 200

def _collect_folder_files_recursive(folder, rel_path=""):
    """Collect tuple of (FileItem, zip_relative_path) for all files in folder tree"""
    items = []
    curr_path = os.path.join(rel_path, folder.name) if rel_path else folder.name
    for file in folder.files.filter_by(is_trashed=False):
        items.append((file, os.path.join(curr_path, file.filename)))
    for sub in folder.subfolders.filter_by(is_trashed=False):
        items.extend(_collect_folder_files_recursive(sub, curr_path))
    return items

def _delete_folder_recursive(folder):
    """Permanently delete folder, subfolders, and associated files from Drive and DB"""
    for file in folder.files:
        try:
            if file.source_type == "google_api_upload" and file.drive_file_id:
                delete_drive_file(file.drive_file_id)
            elif file.source_type == "gas_upload" and file.drive_file_id:
                delete_file_from_gas(file.drive_file_id)
        except Exception:
            pass
        db.session.delete(file)

    for sub in folder.subfolders:
        _delete_folder_recursive(sub)

    # Delete folder from Google Drive if synced
    if getattr(folder, "drive_folder_id", None):
        try:
            delete_drive_file(folder.drive_folder_id)
        except Exception:
            pass

    db.session.delete(folder)

@folder_bp.route("/<int:folder_id>/permanent", methods=["DELETE"])
@require_login
def permanent_delete_folder(folder_id):
    """Permanently delete folder and all contents from cloud and database"""
    folder = Folder.query.get_or_404(folder_id)
    uid = _get_current_uid()
    if uid != 0 and folder.user_id != uid:
        abort(403)

    folder_name = folder.name
    _delete_folder_recursive(folder)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"Folder '{folder_name}' and all contents permanently deleted"
    }), 200

@folder_bp.route("/<int:folder_id>/download-zip", methods=["GET"])
@require_login
def download_folder_zip(folder_id):
    """Stream dynamic on-the-fly .zip of all files inside this folder with hierarchy"""
    folder = Folder.query.get_or_404(folder_id)
    uid = _get_current_uid()
    if uid != 0 and folder.user_id != uid:
        abort(403)

    file_entries = _collect_folder_files_recursive(folder)
    if not file_entries:
        return jsonify({"success": False, "error": "Folder is empty, nothing to download"}), 400

    # Create temporary zip file on disk to prevent OOM
    temp_zip = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    temp_zip_path = temp_zip.name
    temp_zip.close()

    try:
        with zipfile.ZipFile(temp_zip_path, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for file_item, arc_name in file_entries:
                if not file_item.drive_file_id and not file_item.drive_url:
                    continue
                try:
                    resp = resolve_google_drive_stream(file_item.drive_file_id)
                    if resp and resp.status_code in (200, 206):
                        # Write streamed chunks directly into ZIP entry
                        with zf.open(arc_name, mode="w") as zf_entry:
                            for chunk in resp.iter_content(chunk_size=64 * 1024):
                                if chunk:
                                    zf_entry.write(chunk)
                except Exception as stream_err:
                    print(f"[ZIP DOWNLOAD] Failed to pack '{file_item.filename}': {stream_err}")

        @after_this_request
        def cleanup_temp_file(response):
            try:
                if os.path.exists(temp_zip_path):
                    os.remove(temp_zip_path)
            except Exception as e:
                print(f"[ZIP CLEANUP] Error: {e}")
            return response

        safe_name = folder.name.replace(" ", "_").replace("/", "-")
        return send_file(
            temp_zip_path,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"{safe_name}.zip"
        )
    except Exception as e:
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        return jsonify({"success": False, "error": f"Failed to generate ZIP archive: {str(e)}"}), 500
