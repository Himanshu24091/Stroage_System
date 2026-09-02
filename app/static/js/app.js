/**
 * ==============================================================================
 * STEALTH CLOUD VAULT - MAIN APPLICATION LOGIC
 * ==============================================================================
 */

// Global Toast Notification System
window.showToast = function(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === "success") {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    } else if (type === "error") {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `
        ${iconSvg}
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

document.addEventListener("DOMContentLoaded", () => {
    // State
    let currentCategory = "all";
    let currentSort = "newest";
    let searchQuery = "";
    let isGridView = true;
    let allFiles = [];

    // DOM Elements
    const fileListContainer = document.getElementById("fileListContainer");
    const searchInput = document.getElementById("searchInput");
    const sortSelect = document.getElementById("sortSelect");
    const categoryFilterContainer = document.getElementById("categoryFilterContainer");
    const viewGridBtn = document.getElementById("viewGridBtn");
    const viewListBtn = document.getElementById("viewListBtn");
    
    // Stats Elements
    const statTotalFiles = document.getElementById("statTotalFiles");
    const statVaultStorage = document.getElementById("statVaultStorage");

    // Dropzone Elements
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");
    const uploadProgressCard = document.getElementById("uploadProgressCard");
    const uploadFilename = document.getElementById("uploadFilename");
    const uploadPercentage = document.getElementById("uploadPercentage");
    const uploadProgressBar = document.getElementById("uploadProgressBar");
    const uploadSpeed = document.getElementById("uploadSpeed");
    const uploadStatusText = document.getElementById("uploadStatusText");
    const cancelUploadBtn = document.getElementById("cancelUploadBtn");

    // Import Form Elements
    const importLinkForm = document.getElementById("importLinkForm");
    const driveUrlInput = document.getElementById("driveUrlInput");
    const customNameInput = document.getElementById("customNameInput");
    const submitImportBtn = document.getElementById("submitImportBtn");

    // Tab Switching
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const targetId = btn.getAttribute("data-tab");
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add("active");
        });
    });

    // 1. FETCH & RENDER FILES
    async function loadFiles() {
        try {
            const url = `/api/files?category=${encodeURIComponent(currentCategory)}&sort=${encodeURIComponent(currentSort)}&search=${encodeURIComponent(searchQuery)}`;
            const res = await fetch(url);
            
            if (res.status === 401) {
                window.location.href = "/login";
                return;
            }

            const data = await res.json();
            if (data.success) {
                allFiles = data.files || [];
                renderFiles(allFiles);
                updateStats();
            } else {
                showEmptyState("Failed to load files");
            }
        } catch (err) {
            showEmptyState("Connection error. Could not load vault files.");
        }
    }

    async function updateStats() {
        try {
            const res = await fetch("/api/files/storage-stats");
            const data = await res.json();
            if (data.success) {
                if (statTotalFiles) statTotalFiles.textContent = data.total_files;
                if (statVaultStorage) statVaultStorage.textContent = data.total_formatted;
            }
        } catch (err) {
            console.error("Failed to load stats", err);
        }
    }

    function renderFiles(files) {
        if (!files || files.length === 0) {
            showEmptyState();
            return;
        }

        if (isGridView) {
            renderGridView(files);
        } else {
            renderTableView(files);
        }
    }

    function renderGridView(files) {
        fileListContainer.className = "files-grid-view";
        fileListContainer.innerHTML = files.map(file => `
            <div class="file-card" data-id="${file.id}">
                <div class="file-card-top">
                    <div class="file-category-icon icon-${file.category}">
                        ${getCategorySvg(file.category)}
                    </div>
                    <div class="file-details">
                        <div class="file-name-text" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</div>
                        <div class="file-meta-row">
                            <span class="badge badge-${file.category}">${file.category.toUpperCase()}</span>
                            <span>${file.formatted_size}</span>
                        </div>
                    </div>
                </div>

                <div class="file-card-bottom">
                    <div class="file-meta-row">
                        <span>${file.created_at ? file.created_at.split(' ')[0] : ''}</span>
                    </div>
                    <div class="file-action-buttons">
                        <button class="btn-icon preview-btn" title="Live Preview" data-file='${JSON.stringify(file)}'>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                        </button>
                        <a href="${file.download_url}" class="btn-icon" title="Stealth Download" download>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                        </a>
                        <button class="btn-icon copy-link-btn" title="Copy Stealth Proxy Link" data-url="${file.stream_url}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                        </button>
                        <button class="btn-icon danger delete-btn" title="Delete File" data-id="${file.id}" data-name="${escapeHtml(file.filename)}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join("");

        attachActionListeners();
    }

    function renderTableView(files) {
        fileListContainer.className = "files-table-view";
        fileListContainer.innerHTML = `
            <table class="vault-table">
                <thead>
                    <tr>
                        <th>File Name</th>
                        <th>Category</th>
                        <th>Size</th>
                        <th>Date Added</th>
                        <th style="text-align: right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${files.map(file => `
                        <tr data-id="${file.id}">
                            <td>
                                <div class="table-file-cell">
                                    <div class="file-category-icon icon-${file.category}" style="width: 32px; height: 32px;">
                                        ${getCategorySvg(file.category, 16)}
                                    </div>
                                    <span class="file-name-text" style="max-width: 300px;">${escapeHtml(file.filename)}</span>
                                </div>
                            </td>
                            <td><span class="badge badge-${file.category}">${file.category.toUpperCase()}</span></td>
                            <td>${file.formatted_size}</td>
                            <td>${file.created_at || 'Recently'}</td>
                            <td>
                                <div class="file-action-buttons" style="justify-content: flex-end;">
                                    <button class="btn-icon preview-btn" title="Live Preview" data-file='${JSON.stringify(file)}'>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    </button>
                                    <a href="${file.download_url}" class="btn-icon" title="Stealth Download" download>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                    </a>
                                    <button class="btn-icon copy-link-btn" title="Copy Stealth Proxy Link" data-url="${file.stream_url}">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    </button>
                                    <button class="btn-icon danger delete-btn" title="Delete File" data-id="${file.id}" data-name="${escapeHtml(file.filename)}">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;

        attachActionListeners();
    }

    function showEmptyState(msg = "No files in vault yet") {
        fileListContainer.className = "files-grid-view";
        fileListContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                </div>
                <h3>${msg}</h3>
                <p>Drag & drop files above or import a Google Drive link to get started.</p>
            </div>
        `;
    }

    function attachActionListeners() {
        // Preview button
        document.querySelectorAll(".preview-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const fileData = JSON.parse(btn.getAttribute("data-file"));
                if (window.mediaPreview) {
                    window.mediaPreview.open(fileData);
                }
            });
        });

        // Copy Proxy Link button
        document.querySelectorAll(".copy-link-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const streamUrl = btn.getAttribute("data-url");
                const fullUrl = `${window.location.origin}${streamUrl}`;
                navigator.clipboard.writeText(fullUrl).then(() => {
                    window.showToast("Stealth proxy link copied!", "success");
                });
            });
        });

        // Delete button
        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const fileId = btn.getAttribute("data-id");
                const fileName = btn.getAttribute("data-name");

                if (!confirm(`Are you sure you want to delete '${fileName}'?`)) return;

                try {
                    const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
                    const result = await res.json();
                    if (result.success) {
                        window.showToast(`Deleted '${fileName}'`, "success");
                        loadFiles();
                    } else {
                        window.showToast(result.error || "Failed to delete", "error");
                    }
                } catch (err) {
                    window.showToast("Delete request failed", "error");
                }
            });
        });
    }

    // 2. SEARCH & FILTERS
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener("input", (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                searchQuery = e.target.value.trim();
                loadFiles();
            }, 250);
        });
    }

    if (categoryFilterContainer) {
        categoryFilterContainer.querySelectorAll(".pill-btn").forEach(pill => {
            pill.addEventListener("click", () => {
                categoryFilterContainer.querySelectorAll(".pill-btn").forEach(p => p.classList.remove("active"));
                pill.classList.add("active");
                currentCategory = pill.getAttribute("data-category");
                loadFiles();
            });
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener("change", (e) => {
            currentSort = e.target.value;
            loadFiles();
        });
    }

    if (viewGridBtn && viewListBtn) {
        viewGridBtn.addEventListener("click", () => {
            isGridView = true;
            viewGridBtn.classList.add("active");
            viewListBtn.classList.remove("active");
            renderFiles(allFiles);
        });

        viewListBtn.addEventListener("click", () => {
            isGridView = false;
            viewListBtn.classList.add("active");
            viewGridBtn.classList.remove("active");
            renderFiles(allFiles);
        });
    }

    // 3. DROPZONE & BATCH MULTI-FILE CHUNKED UPLOAD
    const batchQueueStatus = document.getElementById("batchQueueStatus");
    const batchRemainingText = document.getElementById("batchRemainingText");
    let uploadQueue = [];
    let isUploading = false;
    let cancelRequested = false;   // global cancel flag
    let currentXHR = null;         // reference to the active XHR so we can abort it

    // Cancel button
    if (cancelUploadBtn) {
        cancelUploadBtn.addEventListener("click", () => {
            if (!isUploading) return;
            cancelRequested = true;
            if (currentXHR) {
                currentXHR.abort();
                currentXHR = null;
            }
            uploadQueue = [];   // clear the remaining queue
            uploadStatusText.textContent = "⛔ Upload cancelled by user.";
            uploadPercentage.textContent = "0%";
            uploadProgressBar.style.width = "0%";
            uploadSpeed.textContent = "0 MB/s";
            window.showToast("Upload cancelled.", "error");
            setTimeout(() => {
                uploadProgressCard.classList.add("hidden");
                isUploading = false;
                cancelRequested = false;
            }, 2000);
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener("click", () => fileInput.click());

        ["dragenter", "dragover"].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add("dragover");
            });
        });

        ["dragleave", "drop"].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove("dragover");
            });
        });

        dropzone.addEventListener("drop", (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                enqueueFiles(Array.from(files));
            }
        });

        fileInput.addEventListener("change", (e) => {
            if (fileInput.files && fileInput.files.length > 0) {
                enqueueFiles(Array.from(fileInput.files));
            }
        });
    }

    function enqueueFiles(files) {
        if (!files || files.length === 0) return;
        uploadQueue.push(...files);
        if (!isUploading) {
            processUploadQueue();
        }
    }

    async function processUploadQueue() {
        if (uploadQueue.length === 0) {
            isUploading = false;
            return;
        }

        isUploading = true;
        cancelRequested = false;
        const totalBatch = uploadQueue.length;
        let completedCount = 0;

        uploadProgressCard.classList.remove("hidden");

        while (uploadQueue.length > 0) {
            if (cancelRequested) break;

            const file = uploadQueue.shift();
            const currentFileNum = completedCount + 1;
            const remainingCount = uploadQueue.length;

            if (batchQueueStatus) batchQueueStatus.textContent = `Batch: ${currentFileNum} / ${totalBatch}`;
            if (batchRemainingText) batchRemainingText.textContent = `${remainingCount} remaining in queue`;

            try {
                await uploadSingleFileChunked(file);
                completedCount++;
            } catch (err) {
                if (cancelRequested) break;
                console.error("File upload error:", err);
                window.showToast(`Failed to upload ${file.name}: ${err.message}`, "error");
            }
        }

        if (!cancelRequested) {
            window.showToast(`Batch completed! ${completedCount} file(s) saved to vault.`, "success");
            setTimeout(() => {
                uploadProgressCard.classList.add("hidden");
            }, 1500);
        }

        if (fileInput) fileInput.value = "";
        isUploading = false;
        cancelRequested = false;
        loadFiles();
        loadStorageStats();
    }

    // -------------------------------------------------------------------------
    // XHR-based chunk upload — gives real upload progress events unlike fetch()
    // -------------------------------------------------------------------------
    function uploadChunkXHR(formData, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            currentXHR = xhr;

            xhr.open("POST", "/api/files/upload-chunk", true);

            // Real upload progress (bytes actually sent to server)
            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress(e.loaded, e.total);
                }
            });

            xhr.addEventListener("load", () => {
                currentXHR = null;
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (data.success) {
                            resolve(data);
                        } else {
                            reject(new Error(data.error || `Server error: ${xhr.status}`));
                        }
                    } catch {
                        reject(new Error("Invalid JSON response from server"));
                    }
                } else {
                    reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                }
            });

            xhr.addEventListener("error", () => {
                currentXHR = null;
                reject(new Error("Network error during chunk upload"));
            });

            xhr.addEventListener("abort", () => {
                currentXHR = null;
                reject(new Error("Upload aborted"));
            });

            xhr.send(formData);
        });
    }

    async function uploadSingleFileChunked(file) {
        uploadFilename.textContent = file.name;
        uploadPercentage.textContent = "0%";
        uploadProgressBar.style.width = "0%";
        uploadSpeed.textContent = "0 MB/s";
        uploadStatusText.textContent = "Preparing chunked stream...";

        // 4MB chunks — GAS base64-encodes payload so actual POST body is ~5.3MB,
        // safely under GAS's ~50MB execution limit and well under Railway's timeout
        const CHUNK_SIZE = 4 * 1024 * 1024;
        const totalSize = file.size;
        const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
        const uploadId = "up_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
        const startTime = Date.now();

        let uploadedBytes = 0;   // bytes confirmed by server
        let chunkBaseBytes = 0;  // bytes from completed chunks (for progress calc)

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            if (cancelRequested) throw new Error("Cancelled");

            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, totalSize);
            const chunkBlob = file.slice(start, end);
            const chunkSize = end - start;

            const formData = new FormData();
            formData.append("chunk", chunkBlob);
            formData.append("upload_id", uploadId);
            formData.append("chunk_index", chunkIndex);
            formData.append("total_chunks", totalChunks);
            formData.append("total_size", totalSize);
            formData.append("filename", file.name);
            formData.append("mime_type", file.type || "application/octet-stream");

            const isLastChunk = (chunkIndex === totalChunks - 1);
            uploadStatusText.textContent = isLastChunk
                ? `Finalizing upload (${chunkIndex + 1}/${totalChunks})...`
                : `Uploading chunk ${chunkIndex + 1} of ${totalChunks}...`;

            // Retry loop (up to 3 attempts per chunk)
            let attempts = 0;
            let success = false;
            let lastError = null;

            while (attempts < 3 && !success && !cancelRequested) {
                attempts++;
                try {
                    await uploadChunkXHR(formData, (loaded, total) => {
                        // Real-time progress: committed chunks + what's in-flight right now
                        const inFlight = (total > 0) ? (loaded / total) * chunkSize : 0;
                        const totalUploaded = chunkBaseBytes + inFlight;
                        const pct = Math.min(100, Math.round((totalUploaded / totalSize) * 100));

                        uploadPercentage.textContent = `${pct}%`;
                        uploadProgressBar.style.width = `${pct}%`;

                        const elapsedSec = (Date.now() - startTime) / 1000;
                        if (elapsedSec > 0.3) {
                            const mbps = ((chunkBaseBytes + inFlight) / (1024 * 1024) / elapsedSec).toFixed(2);
                            uploadSpeed.textContent = `${mbps} MB/s`;
                        }
                    });
                    success = true;
                } catch (err) {
                    lastError = err;
                    if (cancelRequested) break;
                    if (attempts < 3) {
                        uploadStatusText.textContent = `Retrying chunk ${chunkIndex + 1} (attempt ${attempts + 1}/3)...`;
                        await new Promise(r => setTimeout(r, 2000 * attempts)); // backoff
                    }
                }
            }

            if (cancelRequested) throw new Error("Cancelled");

            if (!success) {
                throw new Error(`Chunk ${chunkIndex + 1}/${totalChunks} failed after 3 attempts: ${lastError?.message || 'Unknown error'}`);
            }

            chunkBaseBytes += chunkSize;
            uploadedBytes = chunkBaseBytes;

            // Snap percentage to exactly correct value after chunk confirmed
            const pct = Math.min(100, Math.round((uploadedBytes / totalSize) * 100));
            uploadPercentage.textContent = `${pct}%`;
            uploadProgressBar.style.width = `${pct}%`;
        }

        uploadStatusText.textContent = "✅ Saved to Vault!";
        uploadPercentage.textContent = "100%";
        uploadProgressBar.style.width = "100%";
    }

    // 4. IMPORT GOOGLE DRIVE LINK FORM
    if (importLinkForm) {
        importLinkForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const url = driveUrlInput.value.trim();
            const filename = customNameInput.value.trim();

            if (!url) return;

            submitImportBtn.disabled = true;
            submitImportBtn.innerHTML = `
                <div class="spinner-ring" style="width: 16px; height: 16px; border-width: 2px;"></div>
                <span>Probing Drive Link...</span>
            `;

            try {
                const res = await fetch("/api/files/import-link", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url, filename })
                });

                const result = await res.json();
                if (result.success) {
                    window.showToast("Google Drive link imported to Vault!", "success");
                    driveUrlInput.value = "";
                    customNameInput.value = "";
                    loadFiles();
                } else {
                    window.showToast(result.error || "Failed to import link", "error");
                }
            } catch (err) {
                window.showToast("Error importing drive link", "error");
            } finally {
                submitImportBtn.disabled = false;
                submitImportBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    <span>Add to Vault</span>
                `;
            }
        });
    }

    // SVG Icons Helper
    function getCategorySvg(category, size = 20) {
        switch (category) {
            case "video":
                return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
            case "pdf":
                return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
            case "image":
                return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
            case "audio":
                return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
            case "code":
                return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
            case "archive":
                return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
            default:
                return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
        }
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // 5. USER NOTICES & DELETION WARNING POPUP SYSTEM
    async function checkUserNotices() {
        const container = document.getElementById("userNoticeContainer");
        if (!container) return;

        try {
            const res = await fetch("/api/files/notices");
            if (!res.ok) return;
            const data = await res.json();
            const notices = data.notices || [];

            if (notices.length === 0) {
                container.classList.add("hidden");
                container.innerHTML = "";
                return;
            }

            // Render active notice banner
            const notice = notices[0];
            container.classList.remove("hidden");
            container.innerHTML = `
                <div class="glass-panel" style="border: 1px solid rgba(245, 158, 11, 0.4); background: linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(15, 23, 42, 0.95)); padding: 18px 22px; border-radius: var(--radius-lg); display: flex; justify-content: space-between; align-items: center; gap: 16px; box-shadow: 0 8px 32px rgba(245, 158, 11, 0.2); animation: fadeIn 0.4s ease;">
                    <div style="display: flex; gap: 14px; align-items: flex-start;">
                        <div class="stat-icon-wrapper amber" style="width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; background: rgba(245, 158, 11, 0.2); color: var(--amber-primary);">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                        </div>
                        <div>
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap;">
                                <h4 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--amber-primary);">${escapeHtml(notice.title)}</h4>
                                <span class="role-badge" style="background: rgba(245, 158, 11, 0.2); color: var(--amber-primary); border: 1px solid rgba(245, 158, 11, 0.4); font-size: 0.75rem; font-weight: 700;">
                                    ⏳ Action within ${notice.deadline_days || 2} Days
                                </span>
                            </div>
                            <p style="margin: 0; font-size: 0.88rem; color: var(--text-main); line-height: 1.4;">${escapeHtml(notice.message)}</p>
                        </div>
                    </div>
                    <button type="button" class="btn-secondary dismiss-notice-btn" data-id="${notice.id}" style="border-color: rgba(245, 158, 11, 0.4); color: var(--amber-primary); white-space: nowrap; flex-shrink: 0;">
                        <span>I Understand / Dismiss</span>
                    </button>
                </div>
            `;

            container.querySelector(".dismiss-notice-btn").addEventListener("click", async () => {
                container.style.opacity = "0";
                container.style.transform = "translateY(-10px)";
                container.style.transition = "all 0.3s ease";
                setTimeout(() => container.classList.add("hidden"), 300);

                try {
                    await fetch(`/api/files/notices/${notice.id}/dismiss`, { method: "POST" });
                } catch (e) {}
            });
        } catch (err) {
            console.error("Error checking user notices:", err);
        }
    }

    // Initial Load
    loadFiles();
    checkUserNotices();
});
