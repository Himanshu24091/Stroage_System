import os
import re
import json
import base64
import threading
import urllib.parse
import shutil
import requests
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, abort, g
from config import Config
from app import db
from app.utils.db_models import FileItem, SystemNotice, ChunkUploadPart
from app.utils.auth_guard import require_login
from app.utils.drive_streamer import extract_drive_id, create_stealth_stream_response, USER_AGENT, is_drive_folder_url, extract_drive_folder_id
from app.utils.gas_bridge import upload_file_to_gas, upload_file_from_disk_to_gas, delete_file_from_gas, get_storage_stats_from_gas, is_gas_configured, get_folder_files_from_gas

file_bp = Blueprint("file_bp", __name__)

# -----------------------------------------------------------------------
# Per-upload-id threading locks to prevent data corruption when multiple
# users (or retried chunks) try to write to the same parts.json at once.
# A global dict maps upload_id -> threading.Lock().
# The lock is released and removed once the upload finishes/fails.
# -----------------------------------------------------------------------
_upload_locks: dict = {}
_upload_locks_mutex = threading.Lock()   # protects the dict itself

def _get_upload_lock(upload_id: str) -> threading.Lock:
    """Return (creating if needed) a per-upload threading.Lock."""
    with _upload_locks_mutex:
        if upload_id not in _upload_locks:
            _upload_locks[upload_id] = threading.Lock()
        return _upload_locks[upload_id]

def _release_upload_lock(upload_id: str):
    """Remove the lock for a finished upload_id from the registry."""
    with _upload_locks_mutex:
        _upload_locks.pop(upload_id, None)

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
    Receives individual 4MB file chunks and streams each to Google Apps Script.

    KEY IMPROVEMENTS:
    - Parts tracked in PostgreSQL (NOT ephemeral disk) → survives Railway restarts
    - Idempotent upsert: retrying a failed chunk reuses existing Drive file_id
      so NO duplicate files are created in Drive on retry
    - Per-upload threading lock for concurrent upload safety
    - Detailed error logging printed to Railway logs
    """
    if "chunk" not in request.files:
        return jsonify({"success": False, "error": "Missing chunk in form-data"}), 400

    chunk_file = request.files["chunk"]
    upload_id = request.form.get("upload_id", "").strip()
    try:
        chunk_index = int(request.form.get("chunk_index", 0))
        total_chunks = int(request.form.get("total_chunks", 1))
        total_size = int(request.form.get("total_size", 0))
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Invalid chunk numerical parameters"}), 400

    filename = request.form.get("filename", "unnamed_file").strip()
    mime_type = request.form.get("mime_type", "application/octet-stream").strip()
    part_number = chunk_index + 1  # 1-based

    if not upload_id:
        return jsonify({"success": False, "error": "Missing upload_id"}), 400

    chunk_bytes = chunk_file.read()
    chunk_size = len(chunk_bytes)

    # Validate chunk size: 4MB raw → ~5.3MB base64 payload to GAS
    MAX_CHUNK_BYTES = 8 * 1024 * 1024  # 8MB hard cap
    if chunk_size > MAX_CHUNK_BYTES:
        return jsonify({
            "success": False,
            "error": f"Chunk too large: {chunk_size // (1024*1024)}MB. Max 8MB."
        }), 413

    try:
        if is_gas_configured():
            # ---------------------------------------------------------------
            # IDEMPOTENT CHECK: Did this part already upload successfully?
            # (Prevents duplicate Drive files when client retries a chunk)
            # ---------------------------------------------------------------
            existing_part = ChunkUploadPart.query.filter_by(
                upload_id=upload_id,
                part_number=part_number
            ).first()

            if existing_part:
                # Part already in DB = already uploaded to Drive. Reuse it.
                print(f"[UPLOAD-CHUNK] Idempotent: reusing part {part_number} drive_id={existing_part.drive_file_id}")
                part_drive_id = existing_part.drive_file_id
            else:
                # Upload this chunk to GAS / Google Drive
                part_name = (
                    filename if total_chunks == 1
                    else f"{filename}.part_{part_number}_of_{total_chunks}"
                )
                upload_mime = mime_type if total_chunks == 1 else "application/octet-stream"

                base64_data = base64.b64encode(chunk_bytes).decode("utf-8")
                payload = {
                    "action": "upload",
                    "filename": part_name,
                    "mime_type": upload_mime,
                    "data": base64_data
                }
                resp = requests.post(
                    Config.GAS_WEBHOOK_URL,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    allow_redirects=True,
                    timeout=240  # 4 min max per chunk
                )

                if resp.status_code != 200:
                    return jsonify({"success": False, "error": f"GAS HTTP {resp.status_code} on part {part_number}"}), 502

                res_data = resp.json()
                if not res_data.get("success"):
                    err_msg = res_data.get("error", "GAS upload failed")
                    print(f"[UPLOAD-CHUNK] GAS error part {part_number}: {err_msg}")
                    return jsonify({"success": False, "error": f"GAS part {part_number}: {err_msg}"}), 500

                part_drive_id = res_data.get("file_id")

                # Save part to PostgreSQL (survives Railway restarts!)
                upload_lock = _get_upload_lock(upload_id)
                with upload_lock:
                    new_part = ChunkUploadPart(
                        upload_id=upload_id,
                        user_id=g.current_user.id,
                        part_number=part_number,
                        total_parts=total_chunks,
                        drive_file_id=part_drive_id,
                        part_size=chunk_size,
                        filename=filename,
                        mime_type=mime_type,
                        total_size=total_size
                    )
                    db.session.add(new_part)
                    db.session.commit()

            # Not the last chunk — return immediately
            if chunk_index < total_chunks - 1:
                return jsonify({
                    "success": True,
                    "status": "chunk_uploaded",
                    "chunk_index": chunk_index,
                    "total_chunks": total_chunks
                }), 200

            # ---------------------------------------------------------------
            # FINAL CHUNK: Assemble all parts from DB into MULTIPART: record
            # ---------------------------------------------------------------
            all_parts = ChunkUploadPart.query.filter_by(
                upload_id=upload_id
            ).order_by(ChunkUploadPart.part_number.asc()).all()

            if len(all_parts) < total_chunks:
                missing = total_chunks - len(all_parts)
                print(f"[UPLOAD-CHUNK] Missing {missing} parts for upload_id={upload_id}")
                return jsonify({
                    "success": False,
                    "error": f"Upload incomplete: {len(all_parts)}/{total_chunks} parts received. Missing {missing} parts."
                }), 409

            # Compact part representation: p=part_number, id=drive_file_id, s=size
            parts_list = [{
                "p": p.part_number,
                "id": p.drive_file_id,
                "s": p.part_size
            } for p in all_parts]

            if total_chunks == 1:
                drive_file_id = parts_list[0]["id"]
                drive_url = ""
            else:
                drive_file_id = f"MULTIPART:{json.dumps(parts_list)}"
                drive_url = ""

            source_type = "gas_upload"
            final_file_size = total_size or sum(p.part_size for p in all_parts)

        else:
            # ---------------------------------------------------------------
            # LOCAL STORAGE MODE (no GAS configured)
            # ---------------------------------------------------------------
            temp_dir = os.path.join(os.getcwd(), "temp_uploads", upload_id)
            os.makedirs(temp_dir, exist_ok=True)
            assembled_file = os.path.join(temp_dir, "assembled.bin")

            with open(assembled_file, "ab") as af:
                af.write(chunk_bytes)

            if chunk_index < total_chunks - 1:
                return jsonify({
                    "success": True,
                    "status": "chunk_received",
                    "chunk_index": chunk_index,
                    "total_chunks": total_chunks
                }), 200

            upload_dir = os.path.join(os.getcwd(), "uploads")
            os.makedirs(upload_dir, exist_ok=True)
            safe_name = f"{int(datetime.now(timezone.utc).timestamp())}_{filename}"
            local_path = os.path.join(upload_dir, safe_name)
            shutil.move(assembled_file, local_path)
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

            drive_file_id = None
            drive_url = local_path
            source_type = "local_upload"
            final_file_size = os.path.getsize(local_path)

        # Create FileItem record in DB (drive_file_id is TEXT, holds unlimited length)
        category = FileItem.detect_category(filename, mime_type)
        new_item = FileItem(
            user_id=g.current_user.id,
            filename=filename,
            file_size=final_file_size,
            mime_type=mime_type,
            category=category,
            drive_file_id=drive_file_id,
            drive_url=drive_url,
            source_type=source_type
        )
        db.session.add(new_item)
        db.session.commit()

        # Clean up intermediate chunk records from PostgreSQL now that file is safely saved
        if is_gas_configured() and total_chunks > 1:
            try:
                ChunkUploadPart.query.filter_by(upload_id=upload_id).delete()
                db.session.commit()
                _release_upload_lock(upload_id)
            except Exception as clean_err:
                print(f"[UPLOAD-CHUNK] Cleanup notice: {clean_err}")

        print(f"[UPLOAD-CHUNK] ✅ Successfully saved: '{filename}' ({final_file_size} bytes, {total_chunks} parts) user={g.current_user.id}")
        return jsonify({
            "success": True,
            "message": "File uploaded and processed successfully!",
            "file": new_item.to_dict()
        }), 201

    except requests.exceptions.Timeout as e:
        print(f"[UPLOAD-CHUNK] TIMEOUT part {part_number}: {e}")
        return jsonify({"success": False, "error": f"GAS timed out on part {part_number}. Try again."}), 504
    except requests.exceptions.ConnectionError as e:
        print(f"[UPLOAD-CHUNK] CONNECTION ERROR part {part_number}: {e}")
        return jsonify({"success": False, "error": f"GAS connection failed on part {part_number}"}), 502
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[UPLOAD-CHUNK ERROR] upload_id={upload_id} part={part_number}/{total_chunks}: {str(e)}\n{tb}")
        db.session.rollback()
        return jsonify({"success": False, "error": f"Server error on part {part_number}: {str(e)}"}), 500

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
