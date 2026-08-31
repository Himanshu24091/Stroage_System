import os
import re
import requests
from flask import Response, stream_with_context
from config import Config

# Standard User-Agent for Google Drive stream requests
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def is_drive_folder_url(url: str) -> bool:
    """Checks if a Google Drive link points to a folder"""
    if not url:
        return False
    return "/folders/" in url or "/drive/folders/" in url

def extract_drive_folder_id(url: str) -> str:
    """Extracts Folder ID from Google Drive folder link"""
    if not url:
        return ""
    match = re.search(r"/folders/([a-zA-Z0-9_-]+)", url)
    if match:
        return match.group(1)
    return ""

def extract_drive_id(url_or_id: str) -> str:
    """
    Extracts Google Drive file ID from various link formats:
    - https://drive.google.com/file/d/1A2B3C4D5E.../view?usp=sharing
    - https://drive.google.com/open?id=1A2B3C4D5E...
    - https://drive.google.com/uc?id=1A2B3C4D5E...&export=download
    - Or returns the clean ID if already an ID.
    """
    if not url_or_id:
        return ""
    
    url_or_id = url_or_id.strip()

    # Pattern for /folders/<id>
    folder_match = re.search(r"/folders/([a-zA-Z0-9_-]+)", url_or_id)
    if folder_match:
        return folder_match.group(1)

    # Pattern for /file/d/<id>/
    match = re.search(r"/file/d/([a-zA-Z0-9_-]{20,})", url_or_id)
    if match:
        return match.group(1)

    # Pattern for id=<id>
    match = re.search(r"[?&]id=([a-zA-Z0-9_-]{20,})", url_or_id)
    if match:
        return match.group(1)

    # Pattern for direct ID matching
    match = re.search(r"^([a-zA-Z0-9_-]{25,})$", url_or_id)
    if match:
        return match.group(1)

    return url_or_id

def resolve_google_drive_stream(file_id: str, range_header: str = None):
    """
    Establishes a streaming connection to Google Drive.
    Handles Google's large file virus-scan confirmation screen automatically via session cookies.
    """
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    if range_header:
        session.headers.update({"Range": range_header})

    download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    response = session.get(download_url, stream=True, allow_redirects=True, timeout=60)

    # Check for Google Drive virus warning page on large files (>100MB)
    if response.status_code == 200 and "text/html" in response.headers.get("Content-Type", ""):
        # Search for confirmation token
        content_snippet = response.iter_content(chunk_size=1024 * 64)
        first_chunk = next(content_snippet, b"").decode("utf-8", errors="ignore")

        confirm_match = re.search(r"confirm=([0-9A-Za-z_]+)", first_chunk) or re.search(r"name=\"confirm\"\s+value=\"([0-9A-Za-z_]+)\"", first_chunk)
        if confirm_match:
            confirm_token = confirm_match.group(1)
            confirmed_url = f"https://drive.google.com/uc?export=download&confirm={confirm_token}&id={file_id}"
            response = session.get(confirmed_url, stream=True, allow_redirects=True, timeout=60)

    return response

def create_stealth_stream_response(file_id: str, direct_url: str, filename: str, mime_type: str, range_header: str = None, as_attachment: bool = False):
    """
    Creates a Flask Response that streams the file through our server,
    effectively bypassing office firewall rules while preserving range seeking and proper headers.
    Supports Google Drive IDs, Remote URLs, and Local Storage files.
    """
    chunk_size = Config.STREAM_CHUNK_SIZE
    disposition_type = "attachment" if as_attachment else "inline"
    safe_filename = filename.replace('"', '\\"')

    # Case 1: Local File Path on Disk
    if direct_url and os.path.exists(direct_url) and os.path.isfile(direct_url):
        file_size = os.path.getsize(direct_url)
        byte_start = 0
        byte_end = file_size - 1
        status_code = 200

        if range_header and range_header.startswith("bytes="):
            ranges = range_header.replace("bytes=", "").split("-")
            if ranges[0]:
                byte_start = int(ranges[0])
            if len(ranges) > 1 and ranges[1]:
                byte_end = int(ranges[1])
            status_code = 206

        content_length = (byte_end - byte_start) + 1

        def generate_local_chunks():
            with open(direct_url, "rb") as f:
                f.seek(byte_start)
                bytes_left = content_length
                while bytes_left > 0:
                    read_size = min(chunk_size, bytes_left)
                    data = f.read(read_size)
                    if not data:
                        break
                    bytes_left -= len(data)
                    yield data

        resp_headers = {
            "Content-Type": mime_type or "application/octet-stream",
            "Content-Disposition": f'{disposition_type}; filename="{safe_filename}"',
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Cache-Control": "public, max-age=3600"
        }
        if status_code == 206:
            resp_headers["Content-Range"] = f"bytes {byte_start}-{byte_end}/{file_size}"

        return Response(stream_with_context(generate_local_chunks()), status=status_code, headers=resp_headers)

    # Case 2: Google Drive File ID or Remote URL
    if file_id:
        upstream_resp = resolve_google_drive_stream(file_id, range_header)
    elif direct_url:
        headers = {"User-Agent": USER_AGENT}
        if range_header:
            headers["Range"] = range_header
        upstream_resp = requests.get(direct_url, stream=True, headers=headers, timeout=60)
    else:
        return Response("Invalid file source", status=400)

    if upstream_resp.status_code not in (200, 206):
        return Response(f"Upstream fetch failed with code {upstream_resp.status_code}", status=upstream_resp.status_code)

    def generate_chunks():
        for chunk in upstream_resp.iter_content(chunk_size=chunk_size):
            if chunk:
                yield chunk

    # Prepare response headers
    disposition_type = "attachment" if as_attachment else "inline"
    # Clean filename for header
    safe_filename = filename.replace('"', '\\"')

    resp_headers = {
        "Content-Type": mime_type or upstream_resp.headers.get("Content-Type", "application/octet-stream"),
        "Content-Disposition": f'{disposition_type}; filename="{safe_filename}"',
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600"
    }

    # Pass through Content-Length if available
    if "Content-Length" in upstream_resp.headers:
        resp_headers["Content-Length"] = upstream_resp.headers["Content-Length"]

    # Pass through Content-Range for partial content (206)
    if "Content-Range" in upstream_resp.headers:
        resp_headers["Content-Range"] = upstream_resp.headers["Content-Range"]

    status_code = upstream_resp.status_code
    return Response(stream_with_context(generate_chunks()), status=status_code, headers=resp_headers)
