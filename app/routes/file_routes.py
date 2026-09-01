import os
import re
import urllib.parse
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, abort, g
from app import db
from app.utils.db_models import FileItem, SystemNotice
from app.utils.auth_guard import require_login
from app.utils.drive_streamer import extract_drive_id, create_stealth_stream_response, USER_AGENT, is_drive_folder_url, extract_drive_folder_id
from app.utils.gas_bridge import upload_file_to_gas, upload_file_from_disk_to_gas, delete_file_from_gas, get_storage_stats_from_gas, is_gas_configured, get_folder_files_from_gas
import requests
import shutil

file_bp = Blueprint("file_bp", __name__)

@file_bp.route("", methods=["GET"])
@require_login
def list_files():
    """List stored files for the current authenticated user only"""
    search_query = request.args.get("search", "").strip().lower()
    category = request.args.get("category", "all").strip().lower()
    sort_by = request.args.get("sort", "newest").strip().lower()

    query = FileItem.query.filter_by(user_id=g.current_user.id)

    if search_query:
        query = query.filter(FileItem.filename.ilike(f"%{search_query}%"))

    if category and category != "all":
        query = query.filter(FileItem.category == category)

    if sort_by == "oldest":
        query = query.order_by(FileItem.created_at.asc())
    elif sort_by == "name":
        query = query.order_by(FileItem.filename.asc())
    elif sort_by == "size":
        query = query.order_by(FileItem.file_size.desc())
    else:  # newest default
        query = query.order_by(FileItem.created_at.desc())

    files = query.all()
    file_list = [f.to_dict() for f in files]

    total_files = len(files)
    total_bytes = sum(f.file_size or 0 for f in files)

    return jsonify({
        "success": True,
        "count": total_files,
        "total_bytes": total_bytes,
        "files": file_list
    }), 200

@file_bp.route("/upload", methods=["POST"])
@require_login
def upload_file():
    """Handle direct file upload (legacy fallback)"""
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file uploaded in form-data"}), 400

    uploaded_file = request.files["file"]
    if not uploaded_file or uploaded_file.filename == "":
        return jsonify({"success": False, "error": "Empty filename"}), 400

    filename = uploaded_file.filename
    mime_type = uploaded_file.content_type or "application/octet-stream"
    file_bytes = uploaded_file.read()
    file_size = len(file_bytes)

    if is_gas_configured():
        gas_result = upload_file_to_gas(filename, file_bytes, mime_type)
        if not gas_result.get("success"):
            return jsonify({"success": False, "error": gas_result.get("error", "GAS upload failed")}), 500

        drive_file_id = gas_result.get("file_id")
        drive_url = gas_result.get("download_url") or gas_result.get("view_url") or ""
        source_type = "gas_upload"
    else:
        upload_dir = os.path.join(os.getcwd(), "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        
        safe_filename = f"{int(datetime.now(timezone.utc).timestamp())}_{filename}"
        local_path = os.path.join(upload_dir, safe_filename)
        with open(local_path, "wb") as f:
            f.write(file_bytes)

        drive_file_id = None
        drive_url = local_path
        source_type = "local_upload"

    category = FileItem.detect_category(filename, mime_type)

    new_item = FileItem(
        user_id=g.current_user.id,
        filename=filename,
        file_size=file_size,
        mime_type=mime_type,
        category=category,
        drive_file_id=drive_file_id,
        drive_url=drive_url,
        source_type=source_type
    )
    db.session.add(new_item)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "File uploaded and linked successfully",
        "file": new_item.to_dict()
    }), 201

@file_bp.route("/upload-chunk", methods=["POST"])
@require_login
def upload_chunk():
    """
    Receives individual 5MB/10MB file chunks from client.
    Reassembles full file on last chunk and triggers safe multi-part Google Drive upload.
    Prevents Railway 502 proxy timeouts and browser memory freeze for files up to 2GB.
    """
    if "chunk" not in request.files:
        return jsonify({"success": False, "error": "Missing chunk in form-data"}), 400

    chunk_file = request.files["chunk"]
    upload_id = request.form.get("upload_id", "").strip()
    try:
        chunk_index = int(request.form.get("chunk_index", 0))
        total_chunks = int(request.form.get("total_chunks", 1))
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Invalid chunk numerical parameters"}), 400

    filename = request.form.get("filename", "unnamed_file").strip()
    mime_type = request.form.get("mime_type", "application/octet-stream").strip()

    if not upload_id:
        return jsonify({"success": False, "error": "Missing upload_id"}), 400

    temp_dir = os.path.join(os.getcwd(), "temp_uploads", upload_id)
    os.makedirs(temp_dir, exist_ok=True)

    chunk_path = os.path.join(temp_dir, f"chunk_{chunk_index:06d}")
    chunk_file.save(chunk_path)

    # If more chunks are pending, acknowledge receipt
    if chunk_index < total_chunks - 1:
        return jsonify({
            "success": True,
            "status": "chunk_received",
            "chunk_index": chunk_index,
            "total_chunks": total_chunks
        }), 200

    # Final chunk received -> Reassemble file on disk with zero memory overhead
    try:
        assembled_file = os.path.join(temp_dir, "assembled.bin")
        with open(assembled_file, "wb") as out_f:
            for i in range(total_chunks):
                part_file = os.path.join(temp_dir, f"chunk_{i:06d}")
                if not os.path.exists(part_file):
                    return jsonify({"success": False, "error": f"Missing chunk {i} during assembly"}), 400
                with open(part_file, "rb") as in_f:
                    while True:
                        buf = in_f.read(1024 * 1024)
                        if not buf:
                            break
                        out_f.write(buf)
                try:
                    os.remove(part_file)
                except Exception:
                    pass

        assembled_size = os.path.getsize(assembled_file)

        # Perform Upload (GAS or Local) using disk streaming (RAM remains under 30MB)
        if is_gas_configured():
            gas_result = upload_file_from_disk_to_gas(filename, assembled_file, mime_type)
            # Cleanup temp assembled file
            if os.path.exists(assembled_file):
                try:
                    os.remove(assembled_file)
                    os.rmdir(temp_dir)
                except Exception:
                    pass

            if not gas_result.get("success"):
                return jsonify({"success": False, "error": gas_result.get("error", "Google Drive upload failed")}), 500

            drive_file_id = gas_result.get("file_id")
            drive_url = gas_result.get("download_url") or gas_result.get("view_url") or ""
            source_type = "gas_upload"
        else:
            upload_dir = os.path.join(os.getcwd(), "uploads")
            os.makedirs(upload_dir, exist_ok=True)
            safe_name = f"{int(datetime.now(timezone.utc).timestamp())}_{filename}"
            local_path = os.path.join(upload_dir, safe_name)
            shutil.move(assembled_file, local_path)
            try:
                os.rmdir(temp_dir)
            except Exception:
                pass

            drive_file_id = None
            drive_url = local_path
            source_type = "local_upload"

        category = FileItem.detect_category(filename, mime_type)

        new_item = FileItem(
            user_id=g.current_user.id,
            filename=filename,
            file_size=assembled_size,
            mime_type=mime_type,
            category=category,
            drive_file_id=drive_file_id,
            drive_url=drive_url,
            source_type=source_type
        )
        db.session.add(new_item)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "File uploaded and processed successfully!",
            "file": new_item.to_dict()
        }), 201
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed during chunk reassembly: {str(e)}"}), 500

@file_bp.route("/import-link", methods=["POST"])
@require_login
def import_link():
    """
    Import an existing Google Drive public link (File or Entire Folder).
    Extracts metadata for instant stealth streaming scoped to current user.
    """
    data = request.get_json() or {}
    raw_url = data.get("url", "").strip()
    custom_name = data.get("filename", "").strip()

    if not raw_url:
        return jsonify({"success": False, "error": "Google Drive URL is required"}), 400

    # CASE 1: Google Drive FOLDER URL -> Auto-Sync all files in folder!
    if is_drive_folder_url(raw_url):
        folder_id = extract_drive_folder_id(raw_url)
        if not folder_id:
            return jsonify({"success": False, "error": "Invalid Google Drive folder link"}), 400

        if is_gas_configured():
            gas_res = get_folder_files_from_gas(folder_id)
            if gas_res.get("success"):
                folder_name = gas_res.get("folder_name", "Drive Folder")
                files = gas_res.get("files", [])
                
                if not files:
                    return jsonify({"success": False, "error": f"Folder '{folder_name}' is empty."}), 400

                imported_items = []
                for f in files:
                    cat = FileItem.detect_category(f["filename"], f.get("mime_type", ""))
                    item = FileItem(
                        user_id=g.current_user.id,
                        filename=f["filename"],
                        file_size=f.get("size", 0),
                        mime_type=f.get("mime_type", "application/octet-stream"),
                        category=cat,
                        drive_file_id=f["file_id"],
                        drive_url=f.get("download_url") or f.get("view_url") or "",
                        source_type="direct_link"
                    )
                    db.session.add(item)
                    imported_items.append(item)

                db.session.commit()
                return jsonify({
                    "success": True,
                    "message": f"Successfully imported {len(imported_items)} files from folder '{folder_name}'!",
                    "count": len(imported_items)
                }), 201
            else:
                return jsonify({
                    "success": False,
                    "error": f"Could not read folder via GAS: {gas_res.get('error', 'Unknown error')}. Make sure folder is shared as 'Anyone with link'."
                }), 400
        else:
            return jsonify({
                "success": False,
                "error": "To import an entire Folder, please configure GAS_WEBHOOK_URL. Alternatively, import direct file links."
            }), 400

    # CASE 2: Single Google Drive FILE URL
    drive_id = extract_drive_id(raw_url)
    if not drive_id:
        return jsonify({"success": False, "error": "Could not extract a valid Google Drive File ID from link"}), 400

    filename = custom_name
    file_size = 0
    mime_type = "application/octet-stream"

    # Step 1: Scrape real filename from Google Drive preview page if not supplied
    if not filename:
        try:
            view_url = f"https://drive.google.com/file/d/{drive_id}/view"
            page_resp = requests.get(view_url, headers={"User-Agent": USER_AGENT}, timeout=8)
            if page_resp.status_code == 200:
                html = page_resp.text
                og_match = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', html) or re.search(r'<meta\s+content="([^"]+)"\s+property="og:title"', html)
                if og_match:
                    filename = og_match.group(1).strip()
                else:
                    title_match = re.search(r'<title>(.*?)(?:\s*-\s*Google Drive)?</title>', html)
                    if title_match:
                        raw_title = title_match.group(1).strip()
                        if raw_title and "Google Drive" not in raw_title and "Meet Google Drive" not in raw_title:
                            filename = raw_title
        except Exception:
            pass

    # Step 2: Probe direct stream for Content-Length and Content-Disposition
    try:
        session = requests.Session()
        session.headers.update({"User-Agent": USER_AGENT})
        probe_url = f"https://drive.usercontent.google.com/download?id={drive_id}&export=download&authuser=0&confirm=t"
        resp = session.get(probe_url, stream=True, allow_redirects=True, timeout=8)
        
        cd = resp.headers.get("Content-Disposition", "")
        if not filename and "filename=" in cd:
            found_name = cd.split("filename=")[-1].strip('"; ')
            filename = urllib.parse.unquote(found_name)

        if "Content-Length" in resp.headers and resp.headers["Content-Length"].isdigit():
            file_size = int(resp.headers["Content-Length"])

        ct = resp.headers.get("Content-Type", "")
        if ct and "text/html" not in ct:
            mime_type = ct
    except Exception:
        pass

    if not filename:
        filename = f"drive_file_{drive_id[:8]}"

    category = FileItem.detect_category(filename, mime_type)

    new_item = FileItem(
        user_id=g.current_user.id,
        filename=filename,
        file_size=file_size,
        mime_type=mime_type,
        category=category,
        drive_file_id=drive_id,
        drive_url=raw_url,
        source_type="direct_link"
    )
    db.session.add(new_item)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Google Drive link imported successfully",
        "file": new_item.to_dict()
    }), 201

@file_bp.route("/stream/<int:file_id>", methods=["GET"])
@require_login
def stream_file(file_id: int):
    """
    Stealth Stream proxy for in-browser previews (Video, Audio, PDF, Image).
    Verifies user ownership.
    """
    item = FileItem.query.get_or_404(file_id)
    if item.user_id != g.current_user.id and not g.current_user.is_admin:
        abort(403)

    range_header = request.headers.get("Range", None)

    return create_stealth_stream_response(
        file_id=item.drive_file_id,
        direct_url=item.drive_url,
        filename=item.filename,
        mime_type=item.mime_type,
        range_header=range_header,
        as_attachment=False
    )

@file_bp.route("/download/<int:file_id>", methods=["GET"])
@require_login
def download_file(file_id: int):
    """
    Stealth Download proxy. Verifies user ownership.
    """
    item = FileItem.query.get_or_404(file_id)
    if item.user_id != g.current_user.id and not g.current_user.is_admin:
        abort(403)

    range_header = request.headers.get("Range", None)

    return create_stealth_stream_response(
        file_id=item.drive_file_id,
        direct_url=item.drive_url,
        filename=item.filename,
        mime_type=item.mime_type,
        range_header=range_header,
        as_attachment=True
    )

@file_bp.route("/<int:file_id>", methods=["DELETE"])
@require_login
def delete_file(file_id: int):
    """Delete file from database and trigger deletion from Google Drive. Verifies ownership."""
    item = FileItem.query.get_or_404(file_id)
    if item.user_id != g.current_user.id and not g.current_user.is_admin:
        return jsonify({"success": False, "error": "Unauthorized to delete this file"}), 403

    if item.source_type == "gas_upload" and item.drive_file_id:
        delete_file_from_gas(item.drive_file_id)

    db.session.delete(item)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"'{item.filename}' deleted successfully"
    }), 200

@file_bp.route("/storage-stats", methods=["GET"])
@require_login
def storage_stats():
    """Fetch storage metrics for the currently authenticated user"""
    total_files = FileItem.query.filter_by(user_id=g.current_user.id).count()
    total_bytes = db.session.query(db.func.sum(FileItem.file_size)).filter(FileItem.user_id == g.current_user.id).scalar() or 0

    gas_stats = get_storage_stats_from_gas()

    return jsonify({
        "success": True,
        "total_files": total_files,
        "total_bytes": total_bytes,
        "total_formatted": f"{(total_bytes / (1024 * 1024)):.2f} MB" if total_bytes < 1024**3 else f"{(total_bytes / 1024**3):.2f} GB",
        "drive_metrics": gas_stats
    }), 200

@file_bp.route("/notices", methods=["GET"])
@require_login
def get_user_notices():
    """Fetch active deletion warning / system notices for the logged in user"""
    notices = SystemNotice.query.filter(
        SystemNotice.is_active == True,
        (SystemNotice.user_id == g.current_user.id) | (SystemNotice.user_id.is_(None))
    ).order_by(SystemNotice.created_at.desc()).all()

    return jsonify({
        "success": True,
        "notices": [n.to_dict() for n in notices]
    }), 200

@file_bp.route("/notices/<int:notice_id>/dismiss", methods=["POST"])
@require_login
def dismiss_user_notice(notice_id):
    """User acknowledges and dismisses a notice"""
    notice = SystemNotice.query.get(notice_id)
    # If notice is specific to user, mark inactive or record dismissal
    if notice and notice.user_id == g.current_user.id:
        notice.is_active = False
        db.session.commit()

    return jsonify({"success": True, "message": "Notice dismissed"}), 200
