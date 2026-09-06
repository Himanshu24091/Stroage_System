/**
 * ==============================================================================
 * STEALTH CLOUD VAULT - UNIVERSAL MEDIA & ARCHIVE PREVIEW CONTROLLER
 * ==============================================================================
 */

class MediaPreviewController {
    constructor() {
        this.modal = document.getElementById("previewModal");
        this.previewContainer = document.getElementById("previewContainer");
        this.previewTitle = document.getElementById("previewTitle");
        this.previewCategoryBadge = document.getElementById("previewCategoryBadge");
        this.previewFileSize = document.getElementById("previewFileSize");
        this.previewSourceType = document.getElementById("previewSourceType");
        this.previewDownloadDirect = document.getElementById("previewDownloadDirect");
        this.copyStreamLinkBtn = document.getElementById("copyStreamLinkBtn");
        this.closePreviewBtn = document.getElementById("closePreviewBtn");
        this.loadingSpinner = document.getElementById("previewLoading");
        this.speedSelect = document.getElementById("previewPlaybackSpeed");

        this.currentFile = null;
        this.initEvents();
    }

    initEvents() {
        if (this.closePreviewBtn) {
            this.closePreviewBtn.addEventListener("click", () => this.close());
        }

        // Close on backdrop click
        if (this.modal) {
            this.modal.addEventListener("click", (e) => {
                if (e.target === this.modal) this.close();
            });
        }

        // Close on Escape key
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.modal && this.modal.classList.contains("open")) {
                this.close();
            }
        });

        // Copy Proxy Link
        if (this.copyStreamLinkBtn) {
            this.copyStreamLinkBtn.addEventListener("click", () => {
                if (!this.currentFile) return;
                const fullUrl = `${window.location.origin}${this.currentFile.stream_url}`;
                navigator.clipboard.writeText(fullUrl).then(() => {
                    window.showToast("Stealth Proxy link copied to clipboard!", "success");
                }).catch(() => {
                    window.showToast("Failed to copy link", "error");
                });
            });
        }

        // Playback Speed Controller
        if (this.speedSelect) {
            this.speedSelect.addEventListener("change", (e) => {
                const mediaEl = this.previewContainer.querySelector("video, audio");
                if (mediaEl) {
                    mediaEl.playbackRate = parseFloat(e.target.value) || 1.0;
                }
            });
        }
    }

    open(file) {
        this.currentFile = file;
        if (!this.modal) return;

        // Set metadata
        this.previewTitle.textContent = file.filename;
        this.previewFileSize.textContent = file.formatted_size;
        this.previewCategoryBadge.textContent = file.category.toUpperCase();
        this.previewCategoryBadge.className = `badge badge-${file.category}`;
        this.previewSourceType.textContent = file.source_type === "google_api_upload" ? "Google Drive API" : (file.source_type === "gas_upload" ? "Drive Storage" : "Linked Drive File");
        this.previewDownloadDirect.href = file.download_url;

        if (this.speedSelect) {
            this.speedSelect.style.display = (file.category === "video" || file.category === "audio") ? "block" : "none";
            this.speedSelect.value = "1";
        }

        // Clear container and show spinner
        this.previewContainer.innerHTML = `
            <div class="preview-spinner" id="previewLoading">
                <div class="spinner-ring"></div>
                <span>Streaming media via stealth proxy...</span>
            </div>
        `;

        this.modal.classList.add("open");
        document.body.style.overflow = "hidden";

        // Render appropriate player based on category
        this.renderViewer(file);
    }

    close() {
        if (!this.modal) return;
        this.modal.classList.remove("open");
        document.body.style.overflow = "";

        if (this.speedSelect) {
            this.speedSelect.style.display = "none";
        }
        
        // Stop any running audio/video
        this.previewContainer.innerHTML = "";
        this.currentFile = null;
    }

    renderViewer(file) {
        const streamUrl = file.stream_url;
        const cat = file.category.toLowerCase();
        const ext = file.filename.split(".").pop().toLowerCase();

        setTimeout(() => {
            if (cat === "video") {
                this.previewContainer.innerHTML = `
                    <video class="preview-media-player" controls autoplay playsinline>
                        <source src="${streamUrl}" type="${file.mime_type || 'video/mp4'}">
                        Your browser does not support HTML5 video streaming.
                    </video>
                `;
            } else if (cat === "audio") {
                this.previewContainer.innerHTML = `
                    <div style="padding: 40px; text-align: center; width: 100%;">
                        <div style="font-size: 3rem; margin-bottom: 20px;">🎵</div>
                        <audio class="preview-media-player" controls autoplay style="width: 80%; max-width: 500px;">
                            <source src="${streamUrl}" type="${file.mime_type || 'audio/mpeg'}">
                            Your browser does not support HTML5 audio playback.
                        </audio>
                    </div>
                `;
            } else if (cat === "image") {
                this.previewContainer.innerHTML = `
                    <img src="${streamUrl}" alt="${file.filename}" class="preview-image" loading="lazy">
                `;
            } else if (cat === "pdf") {
                this.previewContainer.innerHTML = `
                    <iframe src="${streamUrl}#toolbar=1" class="preview-pdf-frame" title="PDF Preview"></iframe>
                `;
            } else if (cat === "archive" && (ext === "zip" || ext === "jar" || ext === "war" || ext === "apk")) {
                this.renderArchiveViewer(file);
            } else if (cat === "code" || ext === "md" || (cat === "document" && (file.mime_type.includes("text") || ext === "txt" || ext === "csv"))) {
                fetch(streamUrl)
                    .then(res => res.text())
                    .then(text => {
                        if (ext === "md") {
                            this.renderMarkdown(text);
                        } else {
                            const safeText = this.escapeHtml(text);
                            this.previewContainer.innerHTML = `
                                <div class="code-preview-wrapper">
                                    <div class="code-preview-header">
                                        <span>${file.filename}</span>
                                        <button class="btn-copy-code" onclick="navigator.clipboard.writeText(\`${encodeURIComponent(text)}\`).then(()=>window.showToast('Copied!','success'))">Copy Text</button>
                                    </div>
                                    <pre class="preview-code-block"><code>${safeText}</code></pre>
                                </div>
                            `;
                        }
                    })
                    .catch(err => {
                        this.renderFallback(file);
                    });
            } else {
                this.renderFallback(file);
            }
        }, 80);
    }

    renderArchiveViewer(file) {
        this.previewContainer.innerHTML = `
            <div class="archive-inspector-container">
                <div class="archive-inspector-header">
                    <div class="archive-header-left">
                        <span class="archive-title">📦 ${this.escapeHtml(file.filename)}</span>
                        <span id="archiveMetaSubtitle" class="archive-meta-sub">Reading archive contents...</span>
                    </div>
                    <input type="text" id="archiveSearchInput" class="archive-search-box" placeholder="Search archive files...">
                </div>
                <div id="archiveTableWrapper" class="archive-table-wrapper">
                    <div class="preview-spinner" style="padding: 40px 0;">
                        <div class="spinner-ring"></div>
                        <span>Inspecting ZIP archive structure...</span>
                    </div>
                </div>
            </div>
        `;

        fetch(`/api/files/${file.id}/inspect-archive`)
            .then(res => res.json())
            .then(data => {
                if (!data.success) {
                    throw new Error(data.error || "Failed to inspect archive");
                }

                const subtitle = document.getElementById("archiveMetaSubtitle");
                if (subtitle) {
                    subtitle.textContent = `${data.total_files} items • Total uncompressed: ${this.formatBytes(data.total_uncompressed)}`;
                }

                const wrapper = document.getElementById("archiveTableWrapper");
                if (!wrapper) return;

                const renderTableRows = (items) => {
                    if (items.length === 0) {
                        return `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">No matching files found inside archive</td></tr>`;
                    }
                    return items.map(it => {
                        const icon = it.is_dir ? "📁" : (it.filename.match(/\.(jpg|png|gif|webp)$/i) ? "🖼️" : (it.filename.match(/\.(mp4|mkv)$/i) ? "🎬" : (it.filename.match(/\.(js|py|html|css|json)$/i) ? "💻" : "📄")));
                        const formattedSize = it.is_dir ? "—" : this.formatBytes(it.size);
                        const ratio = (!it.is_dir && it.size > 0) ? Math.round((1 - (it.compressed_size / it.size)) * 100) : 0;
                        const ratioBadge = (!it.is_dir && ratio > 0) ? `<span class="ratio-badge">-${ratio}%</span>` : "";

                        return `
                            <tr>
                                <td class="archive-cell-name">
                                    <span class="archive-item-icon">${icon}</span>
                                    <span class="archive-filename-text" title="${this.escapeHtml(it.filename)}">${this.escapeHtml(it.filename)}</span>
                                </td>
                                <td class="archive-cell-size">${formattedSize}</td>
                                <td class="archive-cell-ratio">${ratioBadge}</td>
                                <td class="archive-cell-date">${it.date_time || "—"}</td>
                            </tr>
                        `;
                    }).join("");
                };

                wrapper.innerHTML = `
                    <table class="archive-tree-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th style="width:110px;">Size</th>
                                <th style="width:90px;">Savings</th>
                                <th style="width:140px;">Date Modified</th>
                            </tr>
                        </thead>
                        <tbody id="archiveTableBody">
                            ${renderTableRows(data.files)}
                        </tbody>
                    </table>
                `;

                // Live search inside archive
                const searchInput = document.getElementById("archiveSearchInput");
                const tbody = document.getElementById("archiveTableBody");
                if (searchInput && tbody) {
                    searchInput.addEventListener("input", (e) => {
                        const q = e.target.value.toLowerCase().trim();
                        const filtered = data.files.filter(f => f.filename.toLowerCase().includes(q));
                        tbody.innerHTML = renderTableRows(filtered);
                    });
                }
            })
            .catch(err => {
                const wrapper = document.getElementById("archiveTableWrapper");
                if (wrapper) {
                    wrapper.innerHTML = `
                        <div class="empty-state" style="padding: 30px;">
                            <div style="font-size: 2rem;">⚠️</div>
                            <h4 style="color:#fff; margin-top:10px;">Could Not Inspect Archive</h4>
                            <p style="font-size:0.85rem; color:var(--text-muted); max-width:360px;">${this.escapeHtml(err.message)}</p>
                            <a href="${file.download_url}" class="btn-primary" style="margin-top:15px;">Download ${file.formatted_size}</a>
                        </div>
                    `;
                }
            });
    }

    renderMarkdown(md) {
        // Lightweight in-browser markdown formatter
        let html = this.escapeHtml(md)
            .replace(/^### (.*$)/gim, '<h3 style="color:#60a5fa;margin:12px 0 6px;">$1</h3>')
            .replace(/^## (.*$)/gim, '<h2 style="color:#93c5fd;margin:16px 0 8px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px;">$1</h2>')
            .replace(/^# (.*$)/gim, '<h1 style="color:#fff;margin:18px 0 10px;">$1</h1>')
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*)\*/gim, '<em>$1</em>')
            .replace(/`([^`]+)`/gim, '<code style="background:rgba(255,255,255,0.1);padding:2px 5px;border-radius:4px;color:#38bdf8;">$1</code>')
            .replace(/\n\n/gim, '<br><br>')
            .replace(/\n/gim, '<br>');

        this.previewContainer.innerHTML = `
            <div class="markdown-preview-container">
                ${html}
            </div>
        `;
    }

    renderFallback(file) {
        this.previewContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon" style="font-size: 2.5rem;">📦</div>
                <h4 style="color: #fff; margin-top: 10px;">Direct Preview Not Supported</h4>
                <p style="font-size: 0.85rem; max-width: 350px;">This file type cannot be previewed directly in browser. Click below to stream download it instantly.</p>
                <a href="${file.download_url}" class="btn-primary" style="margin-top: 15px;">
                    <span>Download ${file.formatted_size}</span>
                </a>
            </div>
        `;
    }

    formatBytes(bytes) {
        bytes = bytes || 0;
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text || "";
        return div.innerHTML;
    }
}

// Global instance
window.mediaPreview = new MediaPreviewController();
