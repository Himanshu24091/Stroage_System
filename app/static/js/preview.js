/**
 * ==============================================================================
 * STEALTH CLOUD VAULT - UNIVERSAL MEDIA PREVIEW CONTROLLER
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
    }

    open(file) {
        this.currentFile = file;
        if (!this.modal) return;

        // Set metadata
        this.previewTitle.textContent = file.filename;
        this.previewFileSize.textContent = file.formatted_size;
        this.previewCategoryBadge.textContent = file.category.toUpperCase();
        this.previewCategoryBadge.className = `badge badge-${file.category}`;
        this.previewSourceType.textContent = file.source_type === "gas_upload" ? "Drive Storage" : "Linked Drive File";
        this.previewDownloadDirect.href = file.download_url;

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
        
        // Stop any running audio/video
        this.previewContainer.innerHTML = "";
        this.currentFile = null;
    }

    renderViewer(file) {
        const streamUrl = file.stream_url;
        const cat = file.category.toLowerCase();

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
            } else if (cat === "code" || cat === "document" && file.mime_type.includes("text")) {
                // Fetch text content to display
                fetch(streamUrl)
                    .then(res => res.text())
                    .then(text => {
                        const safeText = this.escapeHtml(text);
                        this.previewContainer.innerHTML = `
                            <pre class="preview-code-block"><code>${safeText}</code></pre>
                        `;
                    })
                    .catch(err => {
                        this.previewContainer.innerHTML = `
                            <div class="empty-state">
                                <p>Failed to load file preview. You can still download it directly.</p>
                            </div>
                        `;
                    });
            } else {
                // Fallback for binaries/archives
                this.previewContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon" style="font-size: 2rem;">📦</div>
                        <h4 style="color: #fff; margin-top: 10px;">Direct Preview Not Available for this File Type</h4>
                        <p style="font-size: 0.85rem; max-width: 350px;">This file type cannot be previewed in the browser. Click below to stream download it directly to your computer.</p>
                        <a href="${file.download_url}" class="btn-primary" style="margin-top: 15px;">
                            <span>Download ${file.formatted_size}</span>
                        </a>
                    </div>
                `;
            }
        }, 100);
    }

    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global instance
window.mediaPreview = new MediaPreviewController();
