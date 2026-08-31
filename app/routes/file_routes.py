import os
import re
import urllib.parse
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, abort
from app import db
from app.utils.db_models import FileItem
from app.utils.auth_guard import require_pin
from app.utils.drive_streamer import extract_drive_id, create_stealth_stream_response, USER_AGENT, is_drive_folder_url, extract_drive_folder_id
from app.utils.gas_bridge import upload_file_to_gas, delete_file_from_gas, get_storage_stats_from_gas, is_gas_configured, get_folder_files_from_gas
import requests

file_bp = Blueprint("file_bp", __name__)

@file_bp.route("", methods=["GET"])
@require_pin
def list_files():
    """List all stored files with search, category filtering, and sorting"""
    search_query = request.args.get("search", "").strip().lower()
    category = request.args.get("category", "all").strip().lower()
    sort_by = request.args.get("sort", "newest").strip().lower()

    query = FileItem.query

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

    # Calculate summary metrics
    total_files = len(files)
    total_bytes = sum(f.file_size or 0 for f in files)

    return jsonify({
        "success": True,
        "count": total_files,
        "total_bytes": total_bytes,
        "files": file_list
    }), 200

@file_bp.route("/upload", methods=["POST"])
@require_pin
def upload_file():
    """Handle direct file upload via Google Apps Script bridge"""
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
        # Upload directly to Google Drive via GAS Webhook
        gas_result = upload_file_to_gas(filename, file_bytes, mime_type)
        if not gas_result.get("success"):
            return jsonify({"success": False, "error": gas_result.get("error", "GAS upload failed")}), 500

        drive_file_id = gas_result.get("file_id")
        drive_url = gas_result.get("download_url") or gas_result.get("view_url") or ""
        source_type = "gas_upload"
    else:
        # Local Storage Fallback Mode
        upload_dir = os.path.join(os.getcwd(), "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        
        safe_filename = f"{int(datetime.now(timezone.utc).timestamp())}_{filename}"
        local_path = os.path.join(upload_dir, safe_filename)
        with open(local_path, "wb") as f:
            f.write(file_bytes)

        drive_file_id = None
        drive_url = local_path
        source_type = "local_upload"

    # Auto-detect category
    category = FileItem.detect_category(filename, mime_type)

    # Save metadata to database
    new_item = FileItem(
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

@file_bp.route("/import-link", methods=["POST"])
@require_pin
def import_link():
    """
    Import an existing Google Drive public link (File or Entire Folder).
    Extracts metadata for instant stealth streaming.
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

    # Attempt to probe metadata via Google's view page and direct download stream
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
                # Try OpenGraph title <meta property="og:title" content="...">
                og_match = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', html) or re.search(r'<meta\s+content="([^"]+)"\s+property="og:title"', html)
                if og_match:
                    filename = og_match.group(1).strip()
                else:
                    # Try <title> tag (e.g. "<title>MyFile.pdf - Google Drive</title>")
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
        probe_url = f"https://drive.google.com/uc?export=download&id={drive_id}"
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
@require_pin
def stream_file(file_id: int):
    """
    Stealth Stream proxy for in-browser previews (Video, Audio, PDF, Image).
    Supports HTTP Range requests for video seeking.
    """
    item = FileItem.query.get_or_404(file_id)
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
@require_pin
def download_file(file_id: int):
    """
    Stealth Download proxy.
    Streams the file to the client with 'Content-Disposition: attachment'.
    """
    item = FileItem.query.get_or_404(file_id)
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
@require_pin
def delete_file(file_id: int):
    """Delete file from database and trigger deletion from Google Drive if uploaded via GAS"""
    item = FileItem.query.get_or_404(file_id)

    # If file was uploaded via GAS, delete from Google Drive too
    if item.source_type == "gas_upload" and item.drive_file_id:
        delete_file_from_gas(item.drive_file_id)

    db.session.delete(item)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"'{item.filename}' deleted successfully"
    }), 200

@file_bp.route("/storage-stats", methods=["GET"])
@require_pin
def storage_stats():
    """Fetch storage metrics from DB and Google Drive"""
    total_files = FileItem.query.count()
    total_bytes = db.session.query(db.func.sum(FileItem.file_size)).scalar() or 0

    gas_stats = get_storage_stats_from_gas()

    return jsonify({
        "success": True,
        "total_files": total_files,
        "total_bytes": total_bytes,
        "total_formatted": f"{(total_bytes / (1024 * 1024)):.2f} MB" if total_bytes < 1024**3 else f"{(total_bytes / 1024**3):.2f} GB",
        "drive_metrics": gas_stats
    }), 200
