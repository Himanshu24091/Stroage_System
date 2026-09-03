/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT (GAS) - DRIVE BRIDGE FOR STEALTH CLOUD STORAGE
 * ==============================================================================
 * 
 * Instructions to Deploy:
 * 1. Open your browser and go to: https://script.google.com/home
 * 2. Click "New project" (+ button).
 * 3. Delete any code in the editor, and paste this entire file content.
 * 4. Click "Deploy" (top right) -> "New deployment".
 * 5. Select type: "Web app".
 * 6. Set Description: "Drive Bridge Web App".
 * 7. Set "Execute as": "Me (your email)".
 * 8. Set "Who has access": "Anyone" (Required so your Render/Railway backend can reach it).
 * 9. Click "Deploy", authorize permissions when prompted.
 * 10. Copy the "Web app URL" (looks like https://script.google.com/macros/s/.../exec).
 * 11. Paste this URL into your .env file or Railway Environment Variables as:
 *     GAS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
 * ==============================================================================
 * 
 * IMPORTANT: After editing this file, you MUST redeploy as a NEW DEPLOYMENT version:
 *   Deploy → Manage Deployments → Edit (pencil) → Version: "New Version" → Deploy
 * ==============================================================================
 */

// Name of the folder in Google Drive where files will be stored
const FOLDER_NAME = "Stealth_Cloud_Vault";

/**
 * Run this function once in Apps Script Editor by clicking 'Run' (▶️) 
 * to authorize all Google Drive permissions.
 */
function testAuth() {
  const root = DriveApp.getRootFolder();
  const vault = getOrCreateVaultFolder();
  Logger.log("Permissions OK! Vault folder ID: " + vault.getId());
}

function getOrCreateVaultFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  const newFolder = DriveApp.createFolder(FOLDER_NAME);
  // Allow anyone with link to read files (enables stealth stream proxying)
  newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return newFolder;
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: "No post data received" });
    }

    // GAS doPost content size check: postData.contents is a string
    // Base64 of 4MB = ~5.3MB string. GAS can handle up to ~50MB string safely.
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    // =========================================================================
    // Action: Upload Base64 chunk or full file to Google Drive
    // =========================================================================
    if (action === "upload") {
      const fileName = payload.filename || "unnamed_file";
      const mimeType = payload.mime_type || "application/octet-stream";
      const base64Data = payload.data;

      if (!base64Data) {
        return jsonResponse({ success: false, error: "Missing file data" });
      }

      // Safety: Check base64 string length (4MB raw -> ~5.5MB base64 string)
      // GAS safe limit is ~30MB decoded. Reject if clearly too large.
      const base64Len = base64Data.length;
      const estimatedBytes = Math.floor(base64Len * 0.75);
      if (estimatedBytes > 20 * 1024 * 1024) {
        return jsonResponse({
          success: false,
          error: "Chunk too large for GAS processing (" + 
                 Math.round(estimatedBytes / (1024*1024)) + "MB). Max: 20MB per chunk."
        });
      }

      try {
        const decodedBytes = Utilities.base64Decode(base64Data);
        const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
        
        const folder = getOrCreateVaultFolder();
        const file = folder.createFile(blob);
        const isPart = fileName.indexOf(".part_") !== -1;

        if (!isPart) {
          // Only single standalone files need explicit sharing and view URLs
          try {
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          } catch (e) {}
        }

        return jsonResponse({
          success: true,
          file_id: file.getId(),
          filename: file.getName(),
          size: file.getSize(),
          mime_type: file.getMimeType(),
          download_url: isPart ? "" : file.getDownloadUrl(),
          view_url: isPart ? "" : file.getUrl()
        });
      } catch (uploadErr) {
        return jsonResponse({
          success: false,
          error: "Drive upload failed: " + uploadErr.toString()
        });
      }
    }

    // =========================================================================
    // Action: Delete file from Google Drive
    // =========================================================================
    if (action === "delete") {
      const fileId = payload.file_id;
      if (!fileId) {
        return jsonResponse({ success: false, error: "Missing file_id" });
      }

      try {
        const file = DriveApp.getFileById(fileId);
        file.setTrashed(true);
        return jsonResponse({ success: true, message: "File trashed successfully" });
      } catch (err) {
        return jsonResponse({ success: false, error: "File not found or already deleted: " + err.message });
      }
    }

    // =========================================================================
    // Action: Read all files inside a Google Drive Folder
    // =========================================================================
    if (action === "get_folder_files") {
      const folderId = payload.folder_id;
      if (!folderId) {
        return jsonResponse({ success: false, error: "Missing folder_id" });
      }

      try {
        const folder = DriveApp.getFolderById(folderId);
        const filesIter = folder.getFiles();
        const fileList = [];

        while (filesIter.hasNext()) {
          const f = filesIter.next();
          // Ensure file is viewable for stealth streaming
          f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

          fileList.push({
            file_id: f.getId(),
            filename: f.getName(),
            size: f.getSize(),
            mime_type: f.getMimeType(),
            download_url: f.getDownloadUrl(),
            view_url: f.getUrl()
          });
        }

        return jsonResponse({
          success: true,
          folder_name: folder.getName(),
          files: fileList
        });
      } catch (err) {
        return jsonResponse({ success: false, error: "Could not read folder: " + err.message });
      }
    }

    // =========================================================================
    // Action: Check Storage Info
    // =========================================================================
    if (action === "storage_info") {
      try {
        const storageUsed = DriveApp.getStorageUsed();
        const storageLimit = DriveApp.getStorageLimit();
        return jsonResponse({
          success: true,
          storage_used: storageUsed,
          storage_limit: storageLimit,
          used_gb: (storageUsed / (1024 * 1024 * 1024)).toFixed(2),
          limit_gb: (storageLimit / (1024 * 1024 * 1024)).toFixed(2)
        });
      } catch (err) {
        return jsonResponse({ success: false, error: "Storage info error: " + err.message });
      }
    }

    // =========================================================================
    // Action: Health check ping
    // =========================================================================
    if (action === "ping") {
      return jsonResponse({ success: true, status: "ok", timestamp: new Date().toISOString() });
    }

    return jsonResponse({ success: false, error: "Unknown action: " + action });

  } catch (error) {
    return jsonResponse({ success: false, error: "GAS internal error: " + error.toString() });
  }
}

function doGet(e) {
  // Simple health check
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "Stealth Cloud Storage Drive Bridge",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
