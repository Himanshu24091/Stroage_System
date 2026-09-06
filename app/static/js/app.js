/**
 * ==============================================================================
 * STEALTH CLOUD VAULT - MAIN APPLICATION CONTROLLER
 * Full Folder Hierarchy, Universal Previews, Batch ZIP Actions, Starred & Trash
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
    // Application State
    let currentCategory = "all";
    let currentSort = "newest";
    let searchQuery = "";
    let isGridView = true;
    let currentView = "vault";      // "vault" | "starred" | "trash"
    let currentFolderId = null;     // null for root folder
    let breadcrumbsTrail = [{ id: null, name: "Vault" }];
    
    let allFiles = [];
    let allFolders = [];
    let selectedFileIds = new Set();
    let moveTargetFileIds = [];     // for Move modal

    // DOM Elements
    const fileListContainer = document.getElementById("fileListContainer");
    const foldersSection = document.getElementById("foldersSection");
    const foldersGrid = document.getElementById("foldersGrid");
    const foldersCountBadge = document.getElementById("foldersCountBadge");
    const filesCountBadge = document.getElementById("filesCountBadge");
    const filesSectionTitle = document.getElementById("filesSectionTitle");
    const searchInput = document.getElementById("searchInput");
    const sortSelect = document.getElementById("sortSelect");
    const categoryFilterContainer = document.getElementById("categoryFilterContainer");
    const viewGridBtn = document.getElementById("viewGridBtn");
    const viewListBtn = document.getElementById("viewListBtn");
    const vaultBreadcrumbs = document.getElementById("vaultBreadcrumbs");
    const vaultViewTabs = document.getElementById("vaultViewTabs");
    const newFolderBtn = document.getElementById("newFolderBtn");
    const emptyTrashBtn = document.getElementById("emptyTrashBtn");
    const selectAllBtn = document.getElementById("selectAllBtn");

    // Floating Batch Bar
    const floatingBatchBar = document.getElementById("floatingBatchBar");
    const batchSelectedCount = document.getElementById("batchSelectedCount");
    const batchDownloadZipBtn = document.getElementById("batchDownloadZipBtn");
    const batchMoveBtn = document.getElementById("batchMoveBtn");
    const batchTrashBtn = document.getElementById("batchTrashBtn");
    const batchRestoreBtn = document.getElementById("batchRestoreBtn");
    const batchDeletePermanentBtn = document.getElementById("batchDeletePermanentBtn");
    const batchDeselectBtn = document.getElementById("batchDeselectBtn");

    // Modals
    const newFolderModal = document.getElementById("newFolderModal");
    const newFolderForm = document.getElementById("newFolderForm");
    const newFolderNameInput = document.getElementById("newFolderNameInput");
    const renameModal = document.getElementById("renameModal");
    const renameForm = document.getElementById("renameForm");
    const renameInput = document.getElementById("renameInput");
    const renameItemId = document.getElementById("renameItemId");
    const renameItemType = document.getElementById("renameItemType");
    const renameModalTitle = document.getElementById("renameModalTitle");
    const moveModal = document.getElementById("moveModal");
    const moveForm = document.getElementById("moveForm");
    const moveFolderList = document.getElementById("moveFolderList");

    // Dropzone Elements
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");
    const uploadProgressCard = document.getElementById("uploadProgressCard");
    const uploadFilename = document.getElementById("uploadFilename");
    const uploadPercentage = document.getElementById("uploadPercentage");
    const uploadProgressBar = document.getElementById("uploadProgressBar");
    const uploadSpeed = document.getElementById("uploadSpeed");
    const uploadTimer = document.getElementById("uploadTimer");
    const uploadStatusText = document.getElementById("uploadStatusText");
    const cancelUploadBtn = document.getElementById("cancelUploadBtn");

    // Import Form Elements
    const importLinkForm = document.getElementById("importLinkForm");
    const driveUrlInput = document.getElementById("driveUrlInput");
    const customNameInput = document.getElementById("customNameInput");
    const submitImportBtn = document.getElementById("submitImportBtn");

    // Tab Switching (Upload vs Import)
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

    // =========================================================================
    // 1. NAVIGATION & VIEW SWITCHING
    // =========================================================================
    if (vaultViewTabs) {
        vaultViewTabs.querySelectorAll(".view-tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                vaultViewTabs.querySelectorAll(".view-tab-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                currentView = btn.getAttribute("data-view") || "vault";
                currentFolderId = null;
                selectedFileIds.clear();
                updateBatchBar();

                // UI adjustments per view
                if (currentView === "trash") {
                    emptyTrashBtn.classList.remove("hidden");
                    newFolderBtn.classList.add("hidden");
                    filesSectionTitle.textContent = "Deleted Files";
                } else if (currentView === "starred") {
                    emptyTrashBtn.classList.add("hidden");
                    newFolderBtn.classList.add("hidden");
                    filesSectionTitle.textContent = "Starred Files";
                } else {
                    emptyTrashBtn.classList.add("hidden");
                    newFolderBtn.classList.remove("hidden");
                    filesSectionTitle.textContent = "Files";
                }

                refreshAll();
            });
        });
    }

    function renderBreadcrumbs() {
        if (!vaultBreadcrumbs) return;
        if (currentView !== "vault") {
            vaultBreadcrumbs.innerHTML = `
                <span class="breadcrumb-item active">
                    <span>${currentView === "starred" ? "⭐ Starred Items" : "🗑️ Recycle Bin (Trash)"}</span>
                </span>
            `;
            return;
        }

        let html = `
            <span class="breadcrumb-item ${currentFolderId === null ? 'active' : ''}" data-folder-id="root">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                <span>Vault</span>
            </span>
        `;

        if (breadcrumbsTrail.length > 1) {
            for (let i = 1; i < breadcrumbsTrail.length; i++) {
                const b = breadcrumbsTrail[i];
                const isLast = (i === breadcrumbsTrail.length - 1);
                html += `
                    <span class="breadcrumb-separator">/</span>
                    <span class="breadcrumb-item ${isLast ? 'active' : ''}" data-folder-id="${b.id}">
                        <span>${escapeHtml(b.name)}</span>
                    </span>
                `;
            }
        }

        vaultBreadcrumbs.innerHTML = html;

        vaultBreadcrumbs.querySelectorAll(".breadcrumb-item").forEach(item => {
            item.addEventListener("click", () => {
                const fid = item.getAttribute("data-folder-id");
                if (fid === "root") {
                    navigateToFolder(null, [{ id: null, name: "Vault" }]);
                } else {
                    const targetId = parseInt(fid);
                    const idx = breadcrumbsTrail.findIndex(b => b.id === targetId);
                    if (idx !== -1) {
                        navigateToFolder(targetId, breadcrumbsTrail.slice(0, idx + 1));
                    }
                }
            });
        });
    }

    function navigateToFolder(folderId, trail) {
        currentFolderId = folderId;
        breadcrumbsTrail = trail || [{ id: null, name: "Vault" }];
        selectedFileIds.clear();
        updateBatchBar();
        renderBreadcrumbs();
        refreshAll();
    }

    // =========================================================================
    // 2. FETCH & RENDER FOLDERS
    // =========================================================================
    async function loadFolders() {
        try {
            let url = `/api/folders?view=${encodeURIComponent(currentView)}`;
            if (currentView === "vault" && currentFolderId) {
                url += `&parent_id=${currentFolderId}`;
            }

            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to load folders");
            const data = await res.json();
            allFolders = data.folders || [];

            if (data.breadcrumbs && currentView === "vault") {
                breadcrumbsTrail = data.breadcrumbs;
                renderBreadcrumbs();
            }

            renderFolders(allFolders);
        } catch (err) {
            console.error("Load folders error:", err);
            if (foldersGrid) foldersGrid.innerHTML = "";
            if (foldersSection) foldersSection.style.display = "none";
        }
    }

    function renderFolders(folders) {
        if (!foldersGrid || !foldersSection) return;

        if (folders.length === 0) {
            foldersSection.style.display = "none";
            foldersGrid.innerHTML = "";
            if (foldersCountBadge) foldersCountBadge.textContent = "0";
            return;
        }

        foldersSection.style.display = "block";
        if (foldersCountBadge) foldersCountBadge.textContent = folders.length;

        // Clean up any previously teleported folder menus from body
        document.querySelectorAll("body > [id^='folderMenu_']").forEach(el => el.remove());

        foldersGrid.innerHTML = folders.map(f => {
            const color = f.color || "blue";
            const isStarred = f.is_starred;
            return `
                <div class="folder-card folder-color-${color}" data-folder-id="${f.id}">
                    <div class="folder-card-header">
                        <div class="folder-icon-box">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            </svg>
                        </div>
                        <div class="folder-actions-row">
                            <button class="folder-star-btn ${isStarred ? 'starred' : ''}" data-folder-star="${f.id}" title="${isStarred ? 'Unstar' : 'Star'}">
                                ${isStarred ? '★' : '☆'}
                            </button>
                            <div class="dropdown-wrap">
                                <button class="folder-menu-btn" data-folder-menu="${f.id}" title="Folder Options">⋮</button>
                                <div class="dropdown-menu hidden" id="folderMenu_${f.id}">
                                    <button class="dropdown-item" data-folder-action="open" data-id="${f.id}">📁 Open Folder</button>
                                    <button class="dropdown-item" data-folder-action="rename" data-id="${f.id}" data-name="${escapeHtml(f.name)}">✏️ Rename</button>
                                    <button class="dropdown-item" data-folder-action="color" data-id="${f.id}">🎨 Color Accent</button>
                                    <a class="dropdown-item" href="/api/folders/${f.id}/download-zip">📦 Download ZIP</a>
                                    <div class="dropdown-divider"></div>
                                    ${currentView === 'trash' ? `
                                        <button class="dropdown-item" data-folder-action="restore" data-id="${f.id}">↩️ Restore</button>
                                        <button class="dropdown-item item-danger" data-folder-action="permanent" data-id="${f.id}">✕ Delete Permanently</button>
                                    ` : `
                                        <button class="dropdown-item item-danger" data-folder-action="trash" data-id="${f.id}">🗑️ Move to Trash</button>
                                    `}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="folder-card-body" data-open-folder="${f.id}">
                        <h5 class="folder-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</h5>
                        <div class="folder-meta-text">
                            <span>${f.file_count} ${f.file_count === 1 ? 'file' : 'files'}</span>
                            <span class="meta-dot">•</span>
                            <span>${f.formatted_size}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        // Folder Interactions
        foldersGrid.querySelectorAll("[data-open-folder]").forEach(el => {
            el.addEventListener("click", () => {
                const fid = parseInt(el.getAttribute("data-open-folder"));
                const target = allFolders.find(f => f.id === fid);
                if (target) {
                    const newTrail = [...breadcrumbsTrail, { id: target.id, name: target.name }];
                    navigateToFolder(fid, newTrail);
                }
            });
        });

        // Folder Star Toggle
        foldersGrid.querySelectorAll("[data-folder-star]").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const fid = btn.getAttribute("data-folder-star");
                try {
                    const res = await fetch(`/api/folders/${fid}/star`, { method: "PUT" });
                    const d = await res.json();
                    if (d.success) {
                        loadFolders();
                    }
                } catch (err) {
                    window.showToast("Failed to star folder", "error");
                }
            });
        });

        // Folder Menu Toggle
        foldersGrid.querySelectorAll("[data-folder-menu]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const fid = btn.getAttribute("data-folder-menu");
                const menu = document.getElementById(`folderMenu_${fid}`);
                const parentCard = btn.closest(".folder-card");
                const isAlreadyOpen = menu && !menu.classList.contains("hidden") && menu.style.display !== "none";

                hideAllDropdownMenus();

                if (menu && !isAlreadyOpen) {
                    if (parentCard) parentCard.classList.add("menu-open");
                    positionDropdownMenu(menu, btn);
                }
            });
        });

        // Folder Menu Actions
        foldersGrid.querySelectorAll("[data-folder-action]").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const action = btn.getAttribute("data-folder-action");
                const fid = btn.getAttribute("data-id");
                const fname = btn.getAttribute("data-name");

                document.querySelectorAll(".dropdown-menu").forEach(m => m.classList.add("hidden"));

                if (action === "open") {
                    const target = allFolders.find(f => f.id === parseInt(fid));
                    if (target) {
                        const newTrail = [...breadcrumbsTrail, { id: target.id, name: target.name }];
                        navigateToFolder(target.id, newTrail);
                    }
                } else if (action === "rename") {
                    openRenameModal("folder", fid, fname);
                } else if (action === "color") {
                    cycleFolderColor(fid);
                } else if (action === "trash") {
                    trashFolder(fid);
                } else if (action === "restore") {
                    restoreFolder(fid);
                } else if (action === "permanent") {
                    permanentDeleteFolder(fid);
                }
            });
        });
    }

    async function cycleFolderColor(folderId) {
        const colors = ["blue", "purple", "emerald", "amber", "rose", "indigo"];
        const folder = allFolders.find(f => f.id === parseInt(folderId));
        if (!folder) return;
        const currentIdx = colors.indexOf(folder.color || "blue");
        const nextColor = colors[(currentIdx + 1) % colors.length];

        try {
            const res = await fetch(`/api/folders/${folderId}/color`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ color: nextColor })
            });
            if (res.ok) {
                folder.color = nextColor;
                renderFolders(allFolders);
                window.showToast(`Folder color set to ${nextColor}`, "success");
            }
        } catch (err) {
            window.showToast("Failed to update color", "error");
        }
    }

    async function trashFolder(folderId) {
        try {
            const res = await fetch(`/api/folders/${folderId}/trash`, { method: "PUT" });
            const d = await res.json();
            if (d.success) {
                window.showToast("Folder moved to Trash", "info");
                refreshAll();
            } else {
                window.showToast(d.error || "Failed to move folder", "error");
            }
        } catch (err) {
            window.showToast("Network error", "error");
        }
    }

    async function restoreFolder(folderId) {
        try {
            const res = await fetch(`/api/folders/${folderId}/restore`, { method: "PUT" });
            const d = await res.json();
            if (d.success) {
                window.showToast("Folder restored successfully", "success");
                refreshAll();
            }
        } catch (err) {
            window.showToast("Network error", "error");
        }
    }

    async function permanentDeleteFolder(folderId) {
        if (!confirm("Are you sure you want to PERMANENTLY delete this folder and all its contents? This cannot be undone.")) {
            return;
        }
        try {
            const res = await fetch(`/api/folders/${folderId}/permanent`, { method: "DELETE" });
            const d = await res.json();
            if (d.success) {
                window.showToast("Folder permanently deleted", "success");
                refreshAll();
            } else {
                window.showToast(d.error || "Failed to delete", "error");
            }
        } catch (err) {
            window.showToast("Network error", "error");
        }
    }

    // =========================================================================
    // 3. FETCH & RENDER FILES
    // =========================================================================
    async function loadFiles() {
        try {
            let url = `/api/files?category=${encodeURIComponent(currentCategory)}&sort=${encodeURIComponent(currentSort)}&search=${encodeURIComponent(searchQuery)}&view=${encodeURIComponent(currentView)}`;
            if (currentView === "vault" && currentFolderId) {
                url += `&folder_id=${currentFolderId}`;
            }

            const res = await fetch(url);
            if (res.status === 401) {
                window.location.href = "/login";
                return;
            }

            const data = await res.json();
            allFiles = data.files || [];
            if (filesCountBadge) filesCountBadge.textContent = allFiles.length;

            renderFileList(allFiles);
        } catch (err) {
            console.error("Load files error:", err);
            fileListContainer.innerHTML = `
                <div class="empty-state">
                    <p>Failed to load files from storage vault. Please retry.</p>
                </div>
            `;
        }
    }

    function renderFileList(files) {
        if (files.length === 0) {
            fileListContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">${currentView === 'trash' ? '🗑️' : (currentView === 'starred' ? '⭐' : '📂')}</div>
                    <h3>${currentView === 'trash' ? 'Recycle Bin is Empty' : (currentView === 'starred' ? 'No Starred Files' : 'No Files Found')}</h3>
                    <p>${currentView === 'trash' ? 'Deleted files will appear here.' : (currentView === 'starred' ? 'Star files to quickly find them later.' : 'Drag & drop files or upload to store them safely.')}</p>
                </div>
            `;
            return;
        }

        if (isGridView) {
            renderGridView(files);
        } else {
            renderTableView(files);
        }

        bindFileEvents();
    }

    function renderGridView(files) {
        // Clean up any previously teleported file menus from body
        document.querySelectorAll("body > [id^='fileMenu_']").forEach(el => el.remove());
        fileListContainer.className = "files-grid-view";
        fileListContainer.innerHTML = files.map(file => {
            const isSelected = selectedFileIds.has(file.id);
            const isStarred = file.is_starred;
            const categoryBadge = getCategoryBadge(file.category);
            const cat = (file.category || "other").toLowerCase();

            return `
                <div class="file-card ${isSelected ? 'selected' : ''}" data-id="${file.id}">
                    <div class="file-card-header">
                        <div class="card-header-left">
                            <div class="card-select-checkbox">
                                <input type="checkbox" class="file-checkbox" data-check-id="${file.id}" ${isSelected ? 'checked' : ''}>
                            </div>
                            <div class="card-preview-thumb category-icon-${cat}" data-preview-file="${file.id}" title="Click to preview">
                                ${getThumbnailIcon(file)}
                            </div>
                        </div>
                        <div class="card-header-right">
                            <button class="card-star-btn ${isStarred ? 'starred' : ''}" data-file-star="${file.id}" title="${isStarred ? 'Unstar' : 'Star'}">
                                ${isStarred ? '★' : '☆'}
                            </button>
                            <div class="dropdown-wrap">
                                <button class="file-menu-btn" data-menu-id="${file.id}" title="File Options">⋮</button>
                                <div class="dropdown-menu hidden" id="fileMenu_${file.id}">
                                    <button class="dropdown-item" data-action="preview" data-id="${file.id}">👁️ Preview</button>
                                    <a class="dropdown-item" href="${file.download_url}">⬇️ Download</a>
                                    <button class="dropdown-item" data-action="rename" data-id="${file.id}" data-name="${escapeHtml(file.filename)}">✏️ Rename</button>
                                    <button class="dropdown-item" data-action="move" data-id="${file.id}">📁 Move to...</button>
                                    <button class="dropdown-item" data-action="star" data-id="${file.id}">${isStarred ? '☆ Unstar' : '⭐ Star'}</button>
                                    <div class="dropdown-divider"></div>
                                    ${currentView === 'trash' ? `
                                        <button class="dropdown-item" data-action="restore" data-id="${file.id}">↩️ Restore</button>
                                        <button class="dropdown-item item-danger" data-action="permanent" data-id="${file.id}">✕ Delete Permanently</button>
                                    ` : `
                                        <button class="dropdown-item item-danger" data-action="trash" data-id="${file.id}">🗑️ Move to Trash</button>
                                    `}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="file-card-body" data-preview-file="${file.id}">
                        <h5 class="file-name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</h5>
                    </div>

                    <div class="file-card-footer">
                        <div class="card-meta">
                            <span class="file-size">${file.formatted_size}</span>
                            <span class="meta-dot">•</span>
                            ${categoryBadge}
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    }

    function renderTableView(files) {
        // Clean up any previously teleported file menus from body
        document.querySelectorAll("body > [id^='fileMenu_']").forEach(el => el.remove());
        fileListContainer.className = "files-table-view";
        fileListContainer.innerHTML = `
            <table class="files-table">
                <thead>
                    <tr>
                        <th style="width: 44px; text-align: center;"></th>
                        <th style="width: 36px; text-align: center;">⭐</th>
                        <th class="col-name">Name</th>
                        <th style="width: 110px;">Size</th>
                        <th style="width: 110px;">Category</th>
                        <th style="width: 130px;">Source</th>
                        <th style="width: 140px; text-align: right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${files.map(file => {
                        const isSelected = selectedFileIds.has(file.id);
                        const isStarred = file.is_starred;
                        return `
                            <tr class="${isSelected ? 'selected' : ''}" data-id="${file.id}">
                                <td style="text-align: center;">
                                    <input type="checkbox" class="file-checkbox" data-check-id="${file.id}" ${isSelected ? 'checked' : ''}>
                                </td>
                                <td style="text-align: center;">
                                    <button class="table-star-btn ${isStarred ? 'starred' : ''}" data-file-star="${file.id}" title="${isStarred ? 'Unstar' : 'Star'}">
                                        ${isStarred ? '★' : '☆'}
                                    </button>
                                </td>
                                <td class="table-name-cell" data-preview-file="${file.id}">
                                    <div class="table-file-info">
                                        <span class="table-icon">${getFileSmallIcon(file.category)}</span>
                                        <span class="table-filename" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</span>
                                    </div>
                                </td>
                                <td style="white-space: nowrap;">${file.formatted_size}</td>
                                <td>${getCategoryBadge(file.category)}</td>
                                <td><span class="badge-source">${file.source_type === 'google_api_upload' ? 'Drive API' : (file.source_type === 'gas_upload' ? 'Drive Vault' : 'Direct Link')}</span></td>
                                <td style="text-align: right;">
                                    <div class="table-actions">
                                        <button class="btn-icon" data-action="preview" data-id="${file.id}" title="Preview">👁️</button>
                                        <a href="${file.download_url}" class="btn-icon" title="Download">⬇️</a>
                                        <button class="btn-icon" data-menu-id="${file.id}" title="More options">⋮</button>
                                        <div class="dropdown-menu hidden" id="fileMenu_${file.id}">
                                            <button class="dropdown-item" data-action="preview" data-id="${file.id}">👁️ Preview</button>
                                            <a class="dropdown-item" href="${file.download_url}">⬇️ Download</a>
                                            <button class="dropdown-item" data-action="rename" data-id="${file.id}" data-name="${escapeHtml(file.filename)}">✏️ Rename</button>
                                            <button class="dropdown-item" data-action="move" data-id="${file.id}">📁 Move to...</button>
                                            <button class="dropdown-item" data-action="star" data-id="${file.id}">${isStarred ? '☆ Unstar' : '⭐ Star'}</button>
                                            <div class="dropdown-divider"></div>
                                            ${currentView === 'trash' ? `
                                                <button class="dropdown-item" data-action="restore" data-id="${file.id}">↩️ Restore</button>
                                                <button class="dropdown-item item-danger" data-action="permanent" data-id="${file.id}">✕ Delete Permanently</button>
                                            ` : `
                                                <button class="dropdown-item item-danger" data-action="trash" data-id="${file.id}">🗑️ Move to Trash</button>
                                            `}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        `;
    }

    function bindFileEvents() {
        // Multi-select Checkboxes
        fileListContainer.querySelectorAll(".file-checkbox").forEach(chk => {
            chk.addEventListener("change", (e) => {
                e.stopPropagation();
                const fid = parseInt(chk.getAttribute("data-check-id"));
                if (chk.checked) {
                    selectedFileIds.add(fid);
                } else {
                    selectedFileIds.delete(fid);
                }
                updateCardSelectionStyles();
                updateBatchBar();
            });
        });

        // Preview trigger
        fileListContainer.querySelectorAll("[data-preview-file]").forEach(el => {
            el.addEventListener("click", () => {
                const fid = parseInt(el.getAttribute("data-preview-file"));
                const file = allFiles.find(f => f.id === fid);
                if (file && window.mediaPreview) {
                    window.mediaPreview.open(file);
                }
            });
        });

        // Star toggle
        fileListContainer.querySelectorAll("[data-file-star]").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const fid = btn.getAttribute("data-file-star");
                try {
                    const res = await fetch(`/api/files/${fid}/star`, { method: "PUT" });
                    const d = await res.json();
                    if (d.success) {
                        loadFiles();
                    }
                } catch (err) {
                    window.showToast("Failed to star file", "error");
                }
            });
        });

        // Menu Toggle
        fileListContainer.querySelectorAll("[data-menu-id]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const fid = btn.getAttribute("data-menu-id");
                const menu = document.getElementById(`fileMenu_${fid}`);
                const parentCard = btn.closest(".file-card, tr");
                const isAlreadyOpen = menu && !menu.classList.contains("hidden") && menu.style.display !== "none";

                hideAllDropdownMenus();

                if (menu && !isAlreadyOpen) {
                    if (parentCard) parentCard.classList.add("menu-open");
                    positionDropdownMenu(menu, btn);
                }
            });
        });

        // Menu Item Actions
        fileListContainer.querySelectorAll("[data-action]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const action = btn.getAttribute("data-action");
                const fid = btn.getAttribute("data-id");
                const fname = btn.getAttribute("data-name");

                document.querySelectorAll(".dropdown-menu").forEach(m => m.classList.add("hidden"));
                document.querySelectorAll(".file-card, .folder-card, tr").forEach(c => c.classList.remove("menu-open"));

                if (action === "preview") {
                    const file = allFiles.find(f => f.id === parseInt(fid));
                    if (file && window.mediaPreview) window.mediaPreview.open(file);
                } else if (action === "rename") {
                    openRenameModal("file", fid, fname);
                } else if (action === "move") {
                    openMoveModal([parseInt(fid)]);
                } else if (action === "star") {
                    toggleFileStar(fid);
                } else if (action === "trash") {
                    trashFile(fid);
                } else if (action === "restore") {
                    restoreFile(fid);
                } else if (action === "permanent") {
                    permanentDeleteFile(fid);
                }
            });
        });
    }

    // Floating dropdown positioning and outside-click handling
    function positionDropdownMenu(menu, triggerBtn) {
        if (!menu || !triggerBtn) return;
        
        if (menu.parentNode !== document.body) {
            document.body.appendChild(menu);
        }

        menu.style.position = "fixed";
        menu.style.zIndex = "999999";
        menu.style.display = "block";
        menu.classList.remove("hidden");

        const btnRect = triggerBtn.getBoundingClientRect();
        const menuWidth = Math.max(180, menu.offsetWidth || 180);
        const menuHeight = Math.max(220, menu.offsetHeight || 240);

        let left = btnRect.right - menuWidth;
        if (left < 10) left = 10;
        if (left + menuWidth > window.innerWidth - 10) {
            left = window.innerWidth - menuWidth - 10;
        }

        const spaceBelow = window.innerHeight - btnRect.bottom;
        const spaceAbove = btnRect.top;

        if (spaceBelow < menuHeight + 10 && spaceAbove > spaceBelow) {
            // Open upwards
            let top = btnRect.top - menuHeight - 4;
            if (top < 10) top = 10;
            menu.style.top = `${top}px`;
            menu.style.bottom = "auto";
        } else {
            // Open downwards
            let top = btnRect.bottom + 4;
            if (top + menuHeight > window.innerHeight - 10) {
                top = Math.max(10, window.innerHeight - menuHeight - 10);
            }
            menu.style.top = `${top}px`;
            menu.style.bottom = "auto";
        }

        menu.style.left = `${left}px`;
        menu.style.right = "auto";
        menu.style.marginTop = "0";
        menu.style.marginBottom = "0";
    }

    function hideAllDropdownMenus() {
        document.querySelectorAll(".dropdown-menu").forEach(m => {
            m.classList.add("hidden");
            m.style.display = "none";
        });
        document.querySelectorAll(".file-card, .folder-card, tr").forEach(c => c.classList.remove("menu-open"));
    }

    // Close open dropdowns on click outside, page scroll, or window resize
    document.addEventListener("click", hideAllDropdownMenus);
    window.addEventListener("scroll", hideAllDropdownMenus, true);
    window.addEventListener("resize", hideAllDropdownMenus, true);

    function updateCardSelectionStyles() {
        fileListContainer.querySelectorAll(".file-card, tr[data-id]").forEach(el => {
            const fid = parseInt(el.getAttribute("data-id"));
            if (selectedFileIds.has(fid)) {
                el.classList.add("selected");
            } else {
                el.classList.remove("selected");
            }
        });
    }

    function updateBatchBar() {
        if (!floatingBatchBar) return;
        const count = selectedFileIds.size;
        if (count === 0) {
            floatingBatchBar.classList.add("hidden");
            return;
        }

        floatingBatchBar.classList.remove("hidden");
        batchSelectedCount.textContent = `${count} ${count === 1 ? 'item' : 'items'} selected`;

        if (currentView === "trash") {
            batchTrashBtn.classList.add("hidden");
            batchMoveBtn.classList.add("hidden");
            batchRestoreBtn.classList.remove("hidden");
            batchDeletePermanentBtn.classList.remove("hidden");
        } else {
            batchTrashBtn.classList.remove("hidden");
            batchMoveBtn.classList.remove("hidden");
            batchRestoreBtn.classList.add("hidden");
            batchDeletePermanentBtn.classList.add("hidden");
        }
    }

    // Select All
    if (selectAllBtn) {
        selectAllBtn.addEventListener("click", () => {
            if (selectedFileIds.size === allFiles.length) {
                selectedFileIds.clear();
                selectAllBtn.textContent = "Select All";
            } else {
                allFiles.forEach(f => selectedFileIds.add(f.id));
                selectAllBtn.textContent = "Deselect All";
            }
            renderFileList(allFiles);
            updateBatchBar();
        });
    }

    if (batchDeselectBtn) {
        batchDeselectBtn.addEventListener("click", () => {
            selectedFileIds.clear();
            if (selectAllBtn) selectAllBtn.textContent = "Select All";
            renderFileList(allFiles);
            updateBatchBar();
        });
    }

    // =========================================================================
    // 4. BATCH ACTIONS
    // =========================================================================
    if (batchDownloadZipBtn) {
        batchDownloadZipBtn.addEventListener("click", async () => {
            if (selectedFileIds.size === 0) return;
            const ids = Array.from(selectedFileIds);
            window.showToast("Preparing ZIP archive...", "info");

            try {
                const res = await fetch("/api/files/batch-download-zip", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ file_ids: ids })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || "Failed to generate ZIP");
                }

                const blob = await res.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = downloadUrl;
                a.download = `vault_batch_${Date.now()}.zip`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(downloadUrl);
                window.showToast("ZIP download started!", "success");
            } catch (err) {
                window.showToast(err.message, "error");
            }
        });
    }

    if (batchTrashBtn) {
        batchTrashBtn.addEventListener("click", async () => {
            const ids = Array.from(selectedFileIds);
            if (ids.length === 0) return;
            try {
                const res = await fetch("/api/files/batch-trash", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ file_ids: ids })
                });
                const d = await res.json();
                if (d.success) {
                    window.showToast(`${d.count} files moved to Trash`, "info");
                    selectedFileIds.clear();
                    updateBatchBar();
                    refreshAll();
                }
            } catch (err) {
                window.showToast("Batch action failed", "error");
            }
        });
    }

    if (batchRestoreBtn) {
        batchRestoreBtn.addEventListener("click", async () => {
            const ids = Array.from(selectedFileIds);
            if (ids.length === 0) return;
            try {
                const res = await fetch("/api/files/batch-restore", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ file_ids: ids })
                });
                const d = await res.json();
                if (d.success) {
                    window.showToast(`${d.count} files restored`, "success");
                    selectedFileIds.clear();
                    updateBatchBar();
                    refreshAll();
                }
            } catch (err) {
                window.showToast("Restore failed", "error");
            }
        });
    }

    if (batchDeletePermanentBtn) {
        batchDeletePermanentBtn.addEventListener("click", async () => {
            const ids = Array.from(selectedFileIds);
            if (ids.length === 0) return;
            if (!confirm(`Permanently delete ${ids.length} files? This cannot be undone.`)) return;

            try {
                const res = await fetch("/api/files/batch-delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ file_ids: ids })
                });
                const d = await res.json();
                if (d.success) {
                    window.showToast(`${d.count} files permanently deleted`, "success");
                    selectedFileIds.clear();
                    updateBatchBar();
                    refreshAll();
                }
            } catch (err) {
                window.showToast("Deletion failed", "error");
            }
        });
    }

    if (batchMoveBtn) {
        batchMoveBtn.addEventListener("click", () => {
            const ids = Array.from(selectedFileIds);
            if (ids.length > 0) {
                openMoveModal(ids);
            }
        });
    }

    // =========================================================================
    // 5. FILE CRUD ACTIONS (RENAME, MOVE, TRASH, RESTORE)
    // =========================================================================
    async function toggleFileStar(fileId) {
        try {
            const res = await fetch(`/api/files/${fileId}/star`, { method: "PUT" });
            const d = await res.json();
            if (d.success) loadFiles();
        } catch (err) {
            window.showToast("Failed to star file", "error");
        }
    }

    async function trashFile(fileId) {
        try {
            const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
            const d = await res.json();
            if (d.success) {
                window.showToast("File moved to Trash", "info");
                refreshAll();
            }
        } catch (err) {
            window.showToast("Network error", "error");
        }
    }

    async function restoreFile(fileId) {
        try {
            const res = await fetch(`/api/files/${fileId}/restore`, { method: "PUT" });
            const d = await res.json();
            if (d.success) {
                window.showToast("File restored", "success");
                refreshAll();
            }
        } catch (err) {
            window.showToast("Network error", "error");
        }
    }

    async function permanentDeleteFile(fileId) {
        if (!confirm("Permanently delete this file from Google Drive?")) return;
        try {
            const res = await fetch(`/api/files/${fileId}?permanent=true`, { method: "DELETE" });
            const d = await res.json();
            if (d.success) {
                window.showToast("File permanently deleted", "success");
                refreshAll();
            }
        } catch (err) {
            window.showToast("Network error", "error");
        }
    }

    // =========================================================================
    // 6. MODALS LOGIC
    // =========================================================================
    // Close modal utility
    document.querySelectorAll("[data-close-modal]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("open"));
        });
    });

    // New Folder Modal
    if (newFolderBtn && newFolderModal) {
        newFolderBtn.addEventListener("click", () => {
            newFolderForm.reset();
            newFolderModal.classList.add("open");
            newFolderNameInput.focus();
        });
    }

    if (newFolderForm) {
        newFolderForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = newFolderNameInput.value.trim();
            const colorEl = newFolderForm.querySelector('input[name="folderColor"]:checked');
            const color = colorEl ? colorEl.value : "blue";

            if (!name) return;

            try {
                const res = await fetch("/api/folders", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: name,
                        color: color,
                        parent_id: currentFolderId
                    })
                });
                const d = await res.json();
                if (d.success) {
                    window.showToast(`Folder '${name}' created!`, "success");
                    newFolderModal.classList.remove("open");
                    loadFolders();
                } else {
                    window.showToast(d.error || "Failed to create folder", "error");
                }
            } catch (err) {
                window.showToast("Network error", "error");
            }
        });
    }

    // Rename Modal
    function openRenameModal(type, id, currentName) {
        renameItemType.value = type;
        renameItemId.value = id;
        renameInput.value = currentName;
        renameModalTitle.textContent = type === "folder" ? "Rename Folder" : "Rename File";
        renameModal.classList.add("open");
        renameInput.focus();
    }

    if (renameForm) {
        renameForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const type = renameItemType.value;
            const id = renameItemId.value;
            const newName = renameInput.value.trim();
            if (!newName) return;

            const endpoint = type === "folder" ? `/api/folders/${id}/rename` : `/api/files/${id}/rename`;
            const payload = type === "folder" ? { name: newName } : { filename: newName };

            try {
                const res = await fetch(endpoint, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const d = await res.json();
                if (d.success) {
                    window.showToast("Renamed successfully", "success");
                    renameModal.classList.remove("open");
                    if (type === "folder") loadFolders();
                    else loadFiles();
                } else {
                    window.showToast(d.error || "Failed to rename", "error");
                }
            } catch (err) {
                window.showToast("Network error", "error");
            }
        });
    }

    // Move Modal
    async function openMoveModal(fileIds) {
        moveTargetFileIds = fileIds;
        if (!moveFolderList) return;

        moveFolderList.innerHTML = `<div class="spinner-ring" style="margin:20px auto;"></div>`;
        moveModal.classList.add("open");

        try {
            const res = await fetch("/api/folders?view=vault");
            const data = await res.json();
            const folders = data.folders || [];

            let html = `
                <label class="move-folder-option">
                    <input type="radio" name="destFolder" value="root" ${currentFolderId === null ? 'disabled' : 'checked'}>
                    <span class="move-option-content">
                        <span class="move-icon">🏠</span>
                        <span>Root Vault (No folder)</span>
                    </span>
                </label>
            `;

            folders.forEach(f => {
                const isCurrent = (currentFolderId === f.id);
                html += `
                    <label class="move-folder-option ${isCurrent ? 'disabled' : ''}">
                        <input type="radio" name="destFolder" value="${f.id}" ${isCurrent ? 'disabled' : ''}>
                        <span class="move-option-content">
                            <span class="move-icon">📁</span>
                            <span>${escapeHtml(f.name)}</span>
                        </span>
                    </label>
                `;
            });

            moveFolderList.innerHTML = html;
        } catch (err) {
            moveFolderList.innerHTML = `<p style="color:var(--text-muted);padding:10px;">Failed to load destination folders.</p>`;
        }
    }

    if (moveForm) {
        moveForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const checked = moveFolderList.querySelector('input[name="destFolder"]:checked');
            if (!checked) return;

            const targetFolderId = checked.value === "root" ? null : parseInt(checked.value);

            try {
                const res = await fetch("/api/files/batch-move", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        file_ids: moveTargetFileIds,
                        folder_id: targetFolderId
                    })
                });
                const d = await res.json();
                if (d.success) {
                    window.showToast(d.message || "Files moved successfully", "success");
                    moveModal.classList.remove("open");
                    selectedFileIds.clear();
                    updateBatchBar();
                    refreshAll();
                } else {
                    window.showToast(d.error || "Failed to move files", "error");
                }
            } catch (err) {
                window.showToast("Move operation failed", "error");
            }
        });
    }

    // Empty Trash
    if (emptyTrashBtn) {
        emptyTrashBtn.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to permanently empty the entire Recycle Bin? All deleted items will be lost forever.")) {
                return;
            }

            const trashFileIds = allFiles.map(f => f.id);
            const trashFolderIds = allFolders.map(f => f.id);

            try {
                if (trashFileIds.length > 0) {
                    await fetch("/api/files/batch-delete", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ file_ids: trashFileIds })
                    });
                }
                for (const fid of trashFolderIds) {
                    await fetch(`/api/folders/${fid}/permanent`, { method: "DELETE" });
                }

                window.showToast("Recycle Bin emptied successfully", "success");
                refreshAll();
            } catch (err) {
                window.showToast("Failed to empty trash", "error");
            }
        });
    }

    // =========================================================================
    // 7. MULTI-FILE CHUNKED UPLOAD (8MB SLICES VIA GOOGLE DRIVE API v3)
    // =========================================================================
    let uploadQueue = [];
    let isUploading = false;
    let cancelRequested = false;

    if (cancelUploadBtn) {
        cancelUploadBtn.addEventListener("click", () => {
            if (!isUploading) return;
            cancelRequested = true;
            if (activeXhr) {
                activeXhr.abort();
                activeXhr = null;
            }
            uploadQueue = [];
            uploadStatusText.textContent = "⛔ Upload cancelled by user.";
            window.showToast("Upload cancelled.", "error");
            setTimeout(() => {
                uploadProgressCard.classList.add("hidden");
                isUploading = false;
                cancelRequested = false;
            }, 1000);
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener("click", (e) => {
            if (e.target === fileInput || e.target.closest("#uploadProgressCard")) return;
            fileInput.click();
        });

        ["dragenter", "dragover"].forEach(event => {
            dropzone.addEventListener(event, (e) => {
                e.preventDefault();
                dropzone.classList.add("dragover");
            });
        });

        ["dragleave", "drop"].forEach(event => {
            dropzone.addEventListener(event, (e) => {
                e.preventDefault();
                dropzone.classList.remove("dragover");
            });
        });

        dropzone.addEventListener("drop", (e) => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) queueFilesForUpload(files);
        });

        fileInput.addEventListener("change", () => {
            const files = Array.from(fileInput.files);
            if (files.length > 0) queueFilesForUpload(files);
            fileInput.value = "";
        });
    }

    function queueFilesForUpload(files) {
        cancelRequested = false;
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
        let processedCount = 0;

        uploadProgressCard.classList.remove("hidden");

        while (uploadQueue.length > 0) {
            if (cancelRequested) break;

            const file = uploadQueue.shift();
            processedCount++;
            const remainingCount = uploadQueue.length;

            const queueBadge = document.getElementById("batchQueueStatus");
            const remText = document.getElementById("batchRemainingText");
            if (queueBadge) queueBadge.textContent = `Batch Queue: ${processedCount} / ${totalBatch}`;
            if (remText) remText.textContent = `${remainingCount} remaining in queue`;

            try {
                await uploadSingleFileChunked(file);
            } catch (err) {
                console.error("File upload error:", err);
                window.showToast(`Failed to upload ${file.name}: ${err.message}`, "error");
            }

            await new Promise(r => setTimeout(r, 400));
        }

        setTimeout(() => {
            if (!isUploading) {
                uploadProgressCard.classList.add("hidden");
            }
        }, 3000);

        isUploading = false;
        refreshAll();
    }

    let activeXhr = null;

    function uploadChunkXHR(formData, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            activeXhr = xhr;

            xhr.open("POST", "/api/files/upload-chunk", true);
            xhr.timeout = 300000; // 5-minute generous timeout per 16MB chunk

            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress(e.loaded, e.total);
                }
            });

            xhr.onload = () => {
                activeXhr = null;
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300 && data.success) {
                        resolve(data);
                    } else {
                        reject(new Error(data.error || `Server HTTP ${xhr.status}`));
                    }
                } catch (e) {
                    reject(new Error(`Malformed server response: ${xhr.status}`));
                }
            };

            xhr.onerror = () => {
                activeXhr = null;
                reject(new Error("Network error during chunk upload"));
            };

            xhr.ontimeout = () => {
                activeXhr = null;
                reject(new Error("Chunk upload timed out (5 minutes exceeded)"));
            };

            xhr.onabort = () => {
                activeXhr = null;
                reject(new Error("Upload aborted"));
            };

            xhr.send(formData);
        });
    }

    async function uploadSingleFileChunked(file) {
        uploadFilename.textContent = file.name;
        uploadPercentage.textContent = "0%";
        uploadProgressBar.style.width = "0%";
        uploadSpeed.textContent = "0 MB/s";
        if (uploadTimer) uploadTimer.innerHTML = '⏱️ 00:00';
        uploadStatusText.textContent = "Preparing chunked stream...";

        function formatDuration(sec) {
            sec = Math.max(0, Math.floor(sec));
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        }

        const CHUNK_SIZE = 16 * 1024 * 1024; // 16 MB high-speed chunks (halves HTTP roundtrips)
        const totalSize = file.size;
        const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
        const uploadId = "up_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
        const startTime = Date.now();

        let chunkBaseBytes = 0;
        let lastInFlight = 0;

        let liveTimerInterval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            if (uploadTimer) {
                const totalUploadedSoFar = chunkBaseBytes + lastInFlight;
                const bps = elapsed > 0.5 ? totalUploadedSoFar / elapsed : 0;
                if (bps > 1024 && totalUploadedSoFar < totalSize) {
                    const remSec = (totalSize - totalUploadedSoFar) / bps;
                    uploadTimer.innerHTML = `⏱️ ${formatDuration(elapsed)} <span style="opacity:0.75;font-weight:400;font-size:0.72rem;">(~${formatDuration(remSec)} left)</span>`;
                } else {
                    uploadTimer.innerHTML = `⏱️ ${formatDuration(elapsed)}`;
                }
            }
        }, 500);

        try {
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
                formData.append("start_byte", start);
                formData.append("filename", file.name);
                formData.append("mime_type", file.type || "application/octet-stream");

                if (currentFolderId) {
                    formData.append("folder_id", currentFolderId);
                }

                const isLastChunk = (chunkIndex === totalChunks - 1);
                uploadStatusText.textContent = isLastChunk
                    ? `Finalizing upload (${chunkIndex + 1}/${totalChunks})...`
                    : `Uploading chunk ${chunkIndex + 1} of ${totalChunks}...`;

                let attempts = 0;
                let success = false;
                let lastError = null;

                while (attempts < 3 && !success && !cancelRequested) {
                    attempts++;
                    try {
                        await uploadChunkXHR(formData, (loaded, total) => {
                            const inFlight = (total > 0) ? (loaded / total) * chunkSize : 0;
                            lastInFlight = inFlight;
                            const totalUploaded = chunkBaseBytes + inFlight;
                            const pct = Math.min(100, Math.round((totalUploaded / totalSize) * 100));

                            uploadPercentage.textContent = `${pct}%`;
                            uploadProgressBar.style.width = `${pct}%`;

                            const elapsedSec = (Date.now() - startTime) / 1000;
                            if (elapsedSec > 0.3) {
                                const mbps = (totalUploaded / (1024 * 1024) / elapsedSec).toFixed(2);
                                uploadSpeed.textContent = `${mbps} MB/s`;
                            }
                        });
                        success = true;
                    } catch (xhrErr) {
                        lastError = xhrErr;
                        if (cancelRequested) break;
                        if (attempts < 3) {
                            uploadStatusText.textContent = `Network glitch on chunk ${chunkIndex + 1}. Retrying attempt ${attempts + 1}/3...`;
                            await new Promise(res => setTimeout(res, 1200));
                        }
                    }
                }

                if (!success) {
                    throw new Error(`Chunk ${chunkIndex + 1}/${totalChunks} failed after 3 attempts: ${lastError ? lastError.message : 'Unknown'}`);
                }

                chunkBaseBytes += chunkSize;
                lastInFlight = 0;
            }

            clearInterval(liveTimerInterval);
            uploadPercentage.textContent = "100%";
            uploadProgressBar.style.width = "100%";
            uploadStatusText.textContent = "✅ Saved to Vault!";
            window.showToast(`Uploaded '${file.name}' successfully!`, "success");

        } catch (err) {
            clearInterval(liveTimerInterval);
            if (!cancelRequested) {
                uploadStatusText.textContent = `❌ Upload failed: ${err.message}`;
            }
            throw err;
        }
    }

    // =========================================================================
    // 8. IMPORT GOOGLE DRIVE LINK
    // =========================================================================
    if (importLinkForm) {
        importLinkForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const url = driveUrlInput.value.trim();
            const customName = customNameInput ? customNameInput.value.trim() : "";

            if (!url) return;

            submitImportBtn.disabled = true;
            submitImportBtn.innerHTML = `
                <div class="spinner-ring spinner-ring-sm"></div>
                <span>Importing...</span>
            `;

            try {
                const res = await fetch("/api/files/import-link", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        drive_url: url,
                        custom_name: customName || null,
                        folder_id: currentFolderId || null
                    })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    window.showToast(data.message || "File linked to vault!", "success");
                    importLinkForm.reset();
                    refreshAll();
                } else {
                    window.showToast(data.error || "Failed to import Google Drive link", "error");
                }
            } catch (err) {
                window.showToast("Network error. Please try again.", "error");
            } finally {
                submitImportBtn.disabled = false;
                submitImportBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                    <span>Add to Vault</span>
                `;
            }
        });
    }

    // =========================================================================
    // 9. CONTROLS (SEARCH, FILTER, SORT, VIEW TOGGLE)
    // =========================================================================
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener("input", (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                searchQuery = e.target.value.trim();
                loadFiles();
            }, 300);
        });
    }

    if (categoryFilterContainer) {
        categoryFilterContainer.querySelectorAll(".pill-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                categoryFilterContainer.querySelectorAll(".pill-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                currentCategory = btn.getAttribute("data-category");
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
            renderFileList(allFiles);
        });

        viewListBtn.addEventListener("click", () => {
            isGridView = false;
            viewListBtn.classList.add("active");
            viewGridBtn.classList.remove("active");
            renderFileList(allFiles);
        });
    }

    // =========================================================================
    // 10. SYSTEM STATS & HELPERS
    // =========================================================================
    async function loadStats() {
        try {
            const res = await fetch("/api/files/storage-stats");
            if (!res.ok) return;
            const data = await res.json();
            const totalFilesEl = document.getElementById("statTotalFiles");
            const vaultStorageEl = document.getElementById("statVaultStorage");
            if (totalFilesEl) totalFilesEl.textContent = data.total_files || 0;
            if (vaultStorageEl) vaultStorageEl.textContent = data.total_formatted || "0 MB";

            if (data.drive_metrics) {
                const limitEl = document.getElementById("statStorageLimit");
                const usedEl = document.getElementById("statStorageUsed");
                const freeEl = document.getElementById("statStorageFree");
                const barEl = document.getElementById("statStorageBar");

                if (limitEl) limitEl.textContent = data.drive_metrics.formatted_limit || "15.00 GB";
                if (usedEl) usedEl.textContent = data.drive_metrics.formatted_usage || "0 MB";
                if (freeEl) freeEl.textContent = data.drive_metrics.formatted_free || "15.00 GB";
                if (barEl) barEl.style.width = `${data.drive_metrics.percent_used || 0}%`;
            }
        } catch (e) {
            console.error("Stats fetch error:", e);
        }
    }

    function refreshAll() {
        loadFolders();
        loadFiles();
        loadStats();
    }

    function getCategoryBadge(cat) {
        cat = (cat || "other").toLowerCase();
        return `<span class="badge badge-${cat}">${cat.toUpperCase()}</span>`;
    }

    function getFileSmallIcon(cat) {
        switch (cat) {
            case "video": return "🎬";
            case "audio": return "🎵";
            case "image": return "🖼️";
            case "pdf": return "📑";
            case "document": return "📄";
            case "code": return "💻";
            case "archive": return "📦";
            default: return "📁";
        }
    }

    function getThumbnailIcon(file) {
        const cat = (file.category || "other").toLowerCase();
        if (cat === "image") {
            return `<img src="${file.stream_url}" alt="${escapeHtml(file.filename)}" class="grid-thumb-img" loading="lazy" onerror="this.outerHTML='<span class=\\'grid-thumb-emoji\\'>🖼️</span>'">`;
        }
        const emoji = getFileSmallIcon(cat);
        return `<span class="grid-thumb-emoji">${emoji}</span>`;
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text || "";
        return div.innerHTML;
    }

    // Initial Load
    renderBreadcrumbs();
    refreshAll();
});
