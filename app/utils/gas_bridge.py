import base64
import requests
from config import Config

def is_gas_configured() -> bool:
    """Checks if the Google Apps Script Webhook URL is configured"""
    return bool(Config.GAS_WEBHOOK_URL and Config.GAS_WEBHOOK_URL.startswith("http"))

def upload_file_to_gas(filename: str, file_bytes: bytes, mime_type: str = "application/octet-stream") -> dict:
    """
    Sends file bytes to Google Apps Script Webhook to store in personal Google Drive.
    Returns: dict with success status, drive file_id, download_url, etc.
    """
    if not is_gas_configured():
        return {
            "success": False,
            "error": "GAS_WEBHOOK_URL is not configured in .env or Render environment variables."
        }

    try:
        base64_data = base64.b64encode(file_bytes).decode("utf-8")
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
            timeout=120
        )

        if response.status_code == 200:
            return response.json()
        else:
            return {
                "success": False,
                "error": f"GAS responded with HTTP {response.status_code}: {response.text}"
            }
    except Exception as e:
        return {"success": False, "error": f"Failed to upload to GAS: {str(e)}"}

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
    """Sends delete request to Google Apps Script Webhook to trash the file in Google Drive"""
    if not is_gas_configured():
        return {"success": False, "error": "GAS_WEBHOOK_URL is not configured."}

    try:
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
