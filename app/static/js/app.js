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
        const totalBatch = uploadQueue.length;
        let completedCount = 0;

        uploadProgressCard.classList.remove("hidden");

        while (uploadQueue.length > 0) {
            const file = uploadQueue.shift();
            const currentFileNum = completedCount + 1;
            const remainingCount = uploadQueue.length;

            if (batchQueueStatus) batchQueueStatus.textContent = `Batch: ${currentFileNum} / ${totalBatch}`;
            if (batchRemainingText) batchRemainingText.textContent = `${remainingCount} remaining in queue`;

            try {
                await uploadSingleFileChunked(file);
                completedCount++;
            } catch (err) {
                console.error("File upload error:", err);
                window.showToast(`Failed to upload ${file.name}: ${err.message}`, "error");
            }
        }

        window.showToast(`Batch completed! ${completedCount} file(s) saved to vault.`, "success");
        setTimeout(() => {
            uploadProgressCard.classList.add("hidden");
        }, 1500);

        if (fileInput) fileInput.value = "";
        isUploading = false;
        loadFiles();
        loadStorageStats();
    }

    async function uploadSingleFileChunked(file) {
        uploadFilename.textContent = file.name;
        uploadPercentage.textContent = "0%";
        uploadProgressBar.style.width = "0%";
        uploadStatusText.textContent = "Preparing chunked stream...";

        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk (prevents timeouts & memory spikes)
        const totalSize = file.size;
        const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
        const uploadId = "up_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
        const startTime = Date.now();

        let uploadedBytes = 0;

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, totalSize);
            const chunkBlob = file.slice(start, end);

            const formData = new FormData();
            formData.append("chunk", chunkBlob);
            formData.append("upload_id", uploadId);
            formData.append("chunk_index", chunkIndex);
            formData.append("total_chunks", totalChunks);
            formData.append("total_size", totalSize);
            formData.append("filename", file.name);
            formData.append("mime_type", file.type || "application/octet-stream");

            const isLastChunk = (chunkIndex === totalChunks - 1);
            if (isLastChunk) {
                uploadStatusText.textContent = "Finalizing & streaming to Google Drive...";
            } else {
                uploadStatusText.textContent = `Uploading chunk ${chunkIndex + 1} of ${totalChunks}...`;
            }

            const response = await fetch("/api/files/upload-chunk", {
                method: "POST",
                body: formData
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || `Upload failed on chunk ${chunkIndex + 1}`);
            }

            uploadedBytes += (end - start);
            const percent = Math.min(100, Math.round((uploadedBytes / totalSize) * 100));
            uploadPercentage.textContent = `${percent}%`;
            uploadProgressBar.style.width = `${percent}%`;

            const elapsedSeconds = (Date.now() - startTime) / 1000;
            if (elapsedSeconds > 0.5) {
                const bytesPerSec = uploadedBytes / elapsedSeconds;
                const mbPerSec = (bytesPerSec / (1024 * 1024)).toFixed(2);
                uploadSpeed.textContent = `${mbPerSec} MB/s`;
            }
        }
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

    // Initial Load
    loadFiles();
});
