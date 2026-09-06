import os
import json
import time
import threading
import requests
from config import Config

# Module-level thread lock and cached OAuth access token
_auth_lock = threading.Lock()
_cached_token = {
    "access_token": None,
    "expires_at": 0
}

def is_google_api_configured() -> bool:
    """Checks if official Google Drive API OAuth credentials are configured"""
    return bool(
        Config.GOOGLE_REFRESH_TOKEN and 
        Config.GOOGLE_CLIENT_ID and 
        Config.GOOGLE_CLIENT_SECRET
    )

def get_access_token() -> str:
    """
    Thread-safe retrieval of a valid Google OAuth 2.0 Bearer access token.
    Automatically refreshes token before it expires.
    """
    global _cached_token

    now = time.time()
    # If token exists and is valid for at least another 2 minutes, reuse it
    if _cached_token["access_token"] and now < _cached_token["expires_at"] - 120:
        return _cached_token["access_token"]

    with _auth_lock:
        # Re-check under lock
        now = time.time()
        if _cached_token["access_token"] and now < _cached_token["expires_at"] - 120:
            return _cached_token["access_token"]

        token_url = "https://oauth2.googleapis.com/token"
        payload = {
            "client_id": Config.GOOGLE_CLIENT_ID,
            "client_secret": Config.GOOGLE_CLIENT_SECRET,
            "refresh_token": Config.GOOGLE_REFRESH_TOKEN,
            "grant_type": "refresh_token"
        }

        try:
            resp = requests.post(token_url, data=payload, timeout=15)
            if resp.status_code != 200:
                print(f"[GOOGLE API AUTH ERROR] Status {resp.status_code}: {resp.text}")
                raise Exception(f"Failed to refresh Google OAuth token: {resp.text}")

            data = resp.json()
            access_token = data.get("access_token")
            expires_in = data.get("expires_in", 3600)

            _cached_token["access_token"] = access_token
            _cached_token["expires_at"] = now + expires_in
            print(f"[GOOGLE API] Successfully refreshed OAuth access token (valid for {expires_in}s)")
            return access_token
        except Exception as e:
            print(f"[GOOGLE API AUTH EXCEPTION]: {e}")
            raise

def get_auth_headers() -> dict:
    """Returns headers with active Bearer access token"""
    token = get_access_token()
    return {"Authorization": f"Bearer {token}"}

# ==============================================================================
# RESUMABLE UPLOAD PIPELINE
# ==============================================================================

def initiate_resumable_upload(filename: str, mime_type: str, total_size: int, folder_id: str = None) -> dict:
    """
    Initiates a Google Drive Resumable Upload session for a single native file.
    Returns the unique resumable upload location URI.
    """
    target_folder = folder_id or Config.GOOGLE_DRIVE_FOLDER_ID
    headers = get_auth_headers()
    headers.update({
        "X-Upload-Content-Type": mime_type or "application/octet-stream",
        "X-Upload-Content-Length": str(total_size),
        "Content-Type": "application/json; charset=UTF-8"
    })

    metadata = {
        "name": filename
    }
    if target_folder:
        metadata["parents"] = [target_folder]

    init_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true"

    for attempt in range(3):
        try:
            res = requests.post(init_url, headers=headers, json=metadata, timeout=20)
            if res.status_code == 200:
                resumable_url = res.headers.get("Location")
                if resumable_url:
                    return {"success": True, "resumable_url": resumable_url}
                return {"success": False, "error": "Missing Location header from Google Drive API"}
            elif res.status_code in [429, 500, 502, 503, 504]:
                time.sleep(1 + attempt)
                continue
            else:
                return {"success": False, "error": f"Google Drive API HTTP {res.status_code}: {res.text}"}
        except requests.exceptions.RequestException as e:
            if attempt == 2:
                return {"success": False, "error": f"Failed to initiate Google Drive session: {str(e)}"}
            time.sleep(1 + attempt)

    return {"success": False, "error": "Failed to initiate session after retries"}

def upload_resumable_chunk(resumable_url: str, chunk_bytes: bytes, start_byte: int, total_size: int) -> dict:
    """
    Streams a raw binary slice to the Google Drive resumable upload URL.
    Handles HTTP 308 (Resume Incomplete) and HTTP 200/201 (Upload Complete).
    """
    chunk_size = len(chunk_bytes)
    end_byte = start_byte + chunk_size - 1

    headers = {
        "Content-Range": f"bytes {start_byte}-{end_byte}/{total_size}",
        "Content-Length": str(chunk_size),
        "Content-Type": "application/octet-stream"
    }

    for attempt in range(3):
        try:
            res = requests.put(resumable_url, data=chunk_bytes, headers=headers, timeout=120)

            # HTTP 308: Chunk accepted, upload still in progress
            if res.status_code == 308:
                range_header = res.headers.get("Range", "")
                return {
                    "success": True,
                    "completed": False,
                    "status_code": 308,
                    "range": range_header
                }

            # HTTP 200 or 201: File completely uploaded!
            elif res.status_code in (200, 201):
                data = res.json()
                file_id = data.get("id")
                # Make file accessible via stealth proxy link
                try:
                    make_file_readable(file_id)
                except Exception:
                    pass

                return {
                    "success": True,
                    "completed": True,
                    "status_code": res.status_code,
                    "file_id": file_id,
                    "file_metadata": data
                }

            # Google rate limit or transient gateway error: backoff and retry
            elif res.status_code in [429, 500, 502, 503, 504]:
                print(f"[GOOGLE DRIVE CHUNK RETRY] HTTP {res.status_code} on bytes {start_byte}-{end_byte}, retrying...")
                time.sleep(2 * (attempt + 1))
                continue
            else:
                return {
                    "success": False,
                    "error": f"Google Drive API PUT failed HTTP {res.status_code}: {res.text}"
                }
        except requests.exceptions.RequestException as e:
            if attempt == 2:
                return {"success": False, "error": f"Network exception during chunk upload: {str(e)}"}
            time.sleep(2 * (attempt + 1))

    return {"success": False, "error": "Chunk upload failed after 3 attempts"}

def query_upload_status(resumable_url: str, total_size: int) -> dict:
    """
    Queries Google Drive for the exact last byte received, enabling native auto-resume.
    """
    headers = {
        "Content-Range": f"bytes */{total_size}"
    }

    try:
        res = requests.put(resumable_url, headers=headers, timeout=15)
        if res.status_code == 308:
            range_header = res.headers.get("Range", "")
            if range_header and "-" in range_header:
                last_byte = int(range_header.split("-")[1])
                return {"completed": False, "next_byte": last_byte + 1}
            return {"completed": False, "next_byte": 0}
        elif res.status_code in (200, 201):
            file_id = res.json().get("id")
            return {"completed": True, "file_id": file_id}
        else:
            return {"completed": False, "error": f"Status query error: HTTP {res.status_code}"}
    except Exception as e:
        return {"completed": False, "error": str(e)}

def make_file_readable(file_id: str):
    """Sets permission so file can be streamed via stealth proxy without permission dialogs"""
    headers = get_auth_headers()
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}/permissions?supportsAllDrives=true"
    payload = {
        "role": "reader",
        "type": "anyone"
    }
    requests.post(url, headers=headers, json=payload, timeout=10)

# ==============================================================================
# FILE MANAGEMENT & STREAMING
# ==============================================================================

def delete_drive_file(file_id: str) -> bool:
    """Deletes a file from Google Drive using Drive API v3"""
    if not file_id:
        return True

    headers = get_auth_headers()
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}?supportsAllDrives=true"

    try:
        res = requests.delete(url, headers=headers, timeout=15)
        return res.status_code in (200, 204, 404)
    except Exception as e:
        print(f"[GOOGLE DRIVE DELETE ERROR] file_id={file_id}: {e}")
        return False

def get_storage_quota() -> dict:
    """
    Fetches real-time storage quota of the authenticated Google Drive account.
    """
    headers = get_auth_headers()
    url = "https://www.googleapis.com/drive/v3/about?fields=storageQuota,user"

    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code == 200:
            data = res.json()
            quota = data.get("storageQuota", {})
            user_info = data.get("user", {})

            limit_bytes = int(quota.get("limit", 16106127360))  # default 15GB
            usage_bytes = int(quota.get("usage", 0))
            free_bytes = max(0, limit_bytes - usage_bytes)
            percent_used = round((usage_bytes / limit_bytes * 100), 1) if limit_bytes > 0 else 0

            return {
                "success": True,
                "user_name": user_info.get("displayName", "Google Drive User"),
                "user_email": user_info.get("emailAddress", ""),
                "limit_bytes": limit_bytes,
                "usage_bytes": usage_bytes,
                "free_bytes": free_bytes,
                "percent_used": percent_used,
                "formatted_limit": _format_bytes(limit_bytes),
                "formatted_usage": _format_bytes(usage_bytes),
                "formatted_free": _format_bytes(free_bytes)
            }
        else:
            return {"success": False, "error": f"HTTP {res.status_code}: {res.text}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def _format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    elif size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    elif size < 1024 * 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    else:
        return f"{size / (1024 * 1024 * 1024):.2f} GB"
