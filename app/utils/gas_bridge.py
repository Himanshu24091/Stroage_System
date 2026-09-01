import os
import json
import base64
import requests
from config import Config

def is_gas_configured() -> bool:
    """Checks if the Google Apps Script Webhook URL is configured"""
    return bool(Config.GAS_WEBHOOK_URL and Config.GAS_WEBHOOK_URL.startswith("http"))

def upload_file_from_disk_to_gas(filename: str, file_path: str, mime_type: str = "application/octet-stream") -> dict:
    """
    Streams file directly from disk in safe 15MB slices to Google Apps Script.
    Ensures container RAM stays under 30MB at all times, preventing Railway 512MB OOM SIGKILL errors.
    """
    if not is_gas_configured():
        return {
            "success": False,
            "error": "GAS_WEBHOOK_URL is not configured in .env or Railway environment variables."
        }

    if not os.path.exists(file_path):
        return {"success": False, "error": "Source file not found on disk"}

    total_size = os.path.getsize(file_path)
    GAS_MAX_CHUNK_BYTES = 15 * 1024 * 1024  # 15MB per Google Drive part

    # Case 1: Single-part upload for files <= 15MB
    if total_size <= GAS_MAX_CHUNK_BYTES:
        try:
            with open(file_path, "rb") as f:
                file_bytes = f.read()
            base64_data = base64.b64encode(file_bytes).decode("utf-8")
            del file_bytes  # Free RAM immediately

            payload = {
                "action": "upload",
                "filename": filename,
                "mime_type": mime_type,
                "data": base64_data
            }

            response = requests.post(
                Config.GAS_WEBHOOK_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
                allow_redirects=True,
                timeout=180
            )

            if response.status_code == 200:
                return response.json()
            else:
                return {"success": False, "error": f"GAS HTTP {response.status_code}: {response.text}"}
        except Exception as e:
            return {"success": False, "error": f"Failed to upload to GAS: {str(e)}"}

    # Case 2: Multi-part upload for large files (>15MB up to 2GB)
    try:
        num_parts = (total_size + GAS_MAX_CHUNK_BYTES - 1) // GAS_MAX_CHUNK_BYTES
        part_records = []

        with open(file_path, "rb") as f:
            for i in range(num_parts):
                part_slice = f.read(GAS_MAX_CHUNK_BYTES)
                if not part_slice:
                    break
                part_name = f"{filename}.part_{i+1}_of_{num_parts}"

                base64_data = base64.b64encode(part_slice).decode("utf-8")
                part_len = len(part_slice)
                del part_slice  # Free RAM immediately

                payload = {
                    "action": "upload",
                    "filename": part_name,
                    "mime_type": "application/octet-stream",
                    "data": base64_data
                }

                resp = requests.post(
                    Config.GAS_WEBHOOK_URL,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    allow_redirects=True,
                    timeout=240
                )

                if resp.status_code == 200:
                    res_data = resp.json()
                    if not res_data.get("success"):
                        return {"success": False, "error": f"Failed on part {i+1}/{num_parts}: {res_data.get('error')}"}
                    part_records.append({
                        "file_id": res_data.get("file_id"),
                        "size": part_len,
                        "download_url": res_data.get("download_url", "")
                    })
                else:
                    return {"success": False, "error": f"GAS upload part {i+1} failed with HTTP {resp.status_code}"}

        combined_file_id = f"MULTIPART:{json.dumps(part_records)}"

        return {
            "success": True,
            "file_id": combined_file_id,
            "filename": filename,
            "size": total_size,
            "mime_type": mime_type,
            "download_url": "",
            "is_multipart": True,
            "parts_count": num_parts
        }
    except Exception as e:
        return {"success": False, "error": f"Large file multi-part upload failed: {str(e)}"}

def upload_file_to_gas(filename: str, file_bytes: bytes, mime_type: str = "application/octet-stream") -> dict:
    """Convenience wrapper that converts bytes to temporary disk stream for upload"""
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name
    try:
        res = upload_file_from_disk_to_gas(filename, tmp_path, mime_type)
        return res
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

def get_folder_files_from_gas(folder_id: str) -> dict:
    """Fetches list of all files inside a Google Drive folder via GAS Webhook"""
    if not is_gas_configured():
        return {"success": False, "error": "GAS_WEBHOOK_URL is not configured."}

    try:
        payload = {
            "action": "get_folder_files",
            "folder_id": folder_id
        }

        response = requests.post(
            Config.GAS_WEBHOOK_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            allow_redirects=True,
            timeout=45
        )

        if response.status_code == 200:
            return response.json()
        return {"success": False, "error": f"GAS responded with HTTP {response.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def delete_file_from_gas(file_id: str) -> dict:
    """Sends delete request to Google Apps Script Webhook to trash file or all multi-part chunks in Google Drive"""
    if not is_gas_configured():
        return {"success": False, "error": "GAS_WEBHOOK_URL is not configured."}

    try:
        # Check if multipart
        if file_id and file_id.startswith("MULTIPART:"):
            parts_json = file_id.replace("MULTIPART:", "", 1)
            parts = json.loads(parts_json)
            for p in parts:
                p_id = p.get("file_id")
                if p_id:
                    requests.post(
                        Config.GAS_WEBHOOK_URL,
                        json={"action": "delete", "file_id": p_id},
                        headers={"Content-Type": "application/json"},
                        allow_redirects=True,
                        timeout=30
                    )
            return {"success": True, "message": "All multi-part chunks deleted successfully from Google Drive"}

        payload = {
            "action": "delete",
            "file_id": file_id
        }

        response = requests.post(
            Config.GAS_WEBHOOK_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            allow_redirects=True,
            timeout=30
        )

        if response.status_code == 200:
            return response.json()
        return {"success": False, "error": f"HTTP {response.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_storage_stats_from_gas() -> dict:
    """Fetches storage usage metrics from Google Drive via GAS Webhook"""
    if not is_gas_configured():
        return {
            "success": True,
            "storage_configured": False,
            "used_gb": "0.00",
            "limit_gb": "15.00",
            "percentage": 0
        }

    try:
        payload = {"action": "storage_info"}
        response = requests.post(
            Config.GAS_WEBHOOK_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            allow_redirects=True,
            timeout=15
        )

        if response.status_code == 200:
            data = response.json()
            used = data.get("storage_used", 0)
            limit = data.get("storage_limit", 15 * 1024 * 1024 * 1024)
            pct = round((used / limit) * 100, 1) if limit else 0
            return {
                "success": True,
                "storage_configured": True,
                "used_gb": data.get("used_gb", "0.00"),
                "limit_gb": data.get("limit_gb", "15.00"),
                "percentage": pct
            }
        return {"success": False, "error": f"HTTP {response.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}
