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

        if (this._pdfKeyHandler) {
            document.removeEventListener("keydown", this._pdfKeyHandler);
            this._pdfKeyHandler = null;
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
                this.renderAudioViewer(file);
            } else if (cat === "image") {
                this.previewContainer.innerHTML = `
                    <img src="${streamUrl}" alt="${file.filename}" class="preview-image" loading="lazy">
                `;
            } else if (cat === "pdf" || ext === "pdf") {
                this.renderPdfViewer(file);
            } else if (ext === "docx" || ext === "doc") {
                this.renderDocxViewer(file);
            } else if (ext === "xlsx" || ext === "xls") {
                this.renderXlsxViewer(file);
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

    renderAudioViewer(file) {
        const streamUrl = file.stream_url;
        this.previewContainer.innerHTML = `
            <div class="audio-player-wrapper">
                <div class="audio-disc-visualizer">
                    <span class="audio-vinyl-icon">🎵</span>
                </div>
                <div class="audio-track-details">
                    <h4 class="audio-track-title">${this.escapeHtml(file.filename)}</h4>
                    <span class="audio-track-meta">${file.formatted_size} • ${file.source_type === "google_api_upload" ? "Google Drive API" : (file.source_type === "gas_upload" ? "Drive Storage" : "Linked Drive File")}</span>
                </div>
                <audio id="stealthAudioElement" class="stealth-audio-player" controls autoplay preload="auto" src="${streamUrl}">
                    Your browser does not support HTML5 audio playback.
                </audio>
            </div>
        `;

        const audio = document.getElementById("stealthAudioElement");
        if (audio && this.speedSelect) {
            audio.playbackRate = parseFloat(this.speedSelect.value) || 1.0;
        }
    }

    renderDocxViewer(file) {
        const streamUrl = file.stream_url;
        this.previewContainer.innerHTML = `
            <div class="doc-viewer-wrapper">
                <div class="doc-toolbar">
                    <span class="doc-title-badge">📄 Word Document (.${this.escapeHtml(file.filename.split('.').pop())})</span>
                    <div style="display:flex; gap:8px;">
                        <button type="button" class="btn-secondary btn-sm" onclick="window.print()">🖨️ Print</button>
                        <a href="${file.download_url}" class="btn-primary btn-sm">⬇️ Download</a>
                    </div>
                </div>
                <div class="doc-body-scroll" id="docViewerBody">
                    <div class="preview-spinner" id="docxSpinner" style="padding: 60px 0;">
                        <div class="spinner-ring"></div>
                        <span>Converting Word document for in-browser preview...</span>
                    </div>
                    <div id="docxContent" class="docx-paper-view" style="display:none;"></div>
                </div>
            </div>
        `;

        if (typeof mammoth === "undefined") {
            this.renderFallback(file);
            return;
        }

        fetch(streamUrl)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.arrayBuffer();
            })
            .then(arrayBuffer => mammoth.convertToHtml({ arrayBuffer }))
            .then(result => {
                const container = document.getElementById("docxContent");
                const spinner = document.getElementById("docxSpinner");
                if (container) {
                    container.innerHTML = result.value || "<p style='color:#64748b;'>Document has no readable text.</p>";
                    container.style.display = "block";
                }
                if (spinner) spinner.style.display = "none";
            })
            .catch(err => {
                console.error("Docx render error:", err);
                const body = document.getElementById("docViewerBody");
                if (body) {
                    body.innerHTML = `
                        <div class="empty-state" style="padding: 40px 20px;">
                            <div style="font-size: 2.5rem; margin-bottom: 12px;">📄</div>
                            <h4 style="color:#fff;">Could Not Render Word Document</h4>
                            <p style="font-size:0.85rem; color:var(--text-muted); max-width:400px; margin: 8px auto 20px;">
                                ${this.escapeHtml(err.message || 'Stream error')}
                            </p>
                            <a href="${file.download_url}" class="btn-primary">Download ${file.formatted_size}</a>
                        </div>
                    `;
                }
            });
    }

    renderXlsxViewer(file) {
        const streamUrl = file.stream_url;
        this.previewContainer.innerHTML = `
            <div class="spreadsheet-viewer-wrapper">
                <div class="spreadsheet-toolbar">
                    <div class="spreadsheet-sheet-tabs" id="spreadsheetTabs"></div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="text" id="sheetSearchInput" class="spreadsheet-search-box" placeholder="Filter rows...">
                        <a href="${file.download_url}" class="btn-primary btn-sm">⬇️ Download</a>
                    </div>
                </div>
                <div class="spreadsheet-body" id="spreadsheetBody">
                    <div class="preview-spinner" id="sheetSpinner" style="padding: 60px 0;">
                        <div class="spinner-ring"></div>
                        <span>Parsing spreadsheet sheets & tables...</span>
                    </div>
                    <div id="sheetTableContainer" class="spreadsheet-table-container" style="display:none;"></div>
                </div>
            </div>
        `;

        if (typeof XLSX === "undefined") {
            this.renderFallback(file);
            return;
        }

        fetch(streamUrl)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.arrayBuffer();
            })
            .then(arrayBuffer => {
                const workbook = XLSX.read(arrayBuffer, { type: "array" });
                const tabsContainer = document.getElementById("spreadsheetTabs");
                const tableContainer = document.getElementById("sheetTableContainer");
                const spinner = document.getElementById("sheetSpinner");
                const searchInput = document.getElementById("sheetSearchInput");

                if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                    throw new Error("No sheets found in workbook");
                }

                if (spinner) spinner.style.display = "none";
                if (tableContainer) tableContainer.style.display = "block";

                const renderSheet = (sheetName) => {
                    const worksheet = workbook.Sheets[sheetName];
                    if (!worksheet) return;

                    const html = XLSX.utils.sheet_to_html(worksheet, { id: "activeExcelTable", editable: false });
                    tableContainer.innerHTML = html;

                    if (searchInput && searchInput.value.trim()) {
                        filterRows(searchInput.value.trim().toLowerCase());
                    }
                };

                const filterRows = (q) => {
                    const table = document.getElementById("activeExcelTable");
                    if (!table) return;
                    const rows = table.querySelectorAll("tr");
                    rows.forEach((r, idx) => {
                        if (idx === 0) return;
                        const txt = r.textContent.toLowerCase();
                        r.style.display = txt.includes(q) ? "" : "none";
                    });
                };

                if (searchInput) {
                    searchInput.addEventListener("input", (e) => {
                        filterRows(e.target.value.toLowerCase().trim());
                    });
                }

                if (tabsContainer) {
                    tabsContainer.innerHTML = workbook.SheetNames.map((name, idx) => `
                        <button type="button" class="sheet-tab-btn ${idx === 0 ? 'active' : ''}" data-sheet="${this.escapeHtml(name)}">
                            📊 ${this.escapeHtml(name)}
                        </button>
                    `).join("");

                    tabsContainer.querySelectorAll(".sheet-tab-btn").forEach(btn => {
                        btn.addEventListener("click", () => {
                            tabsContainer.querySelectorAll(".sheet-tab-btn").forEach(b => b.classList.remove("active"));
                            btn.classList.add("active");
                            renderSheet(btn.getAttribute("data-sheet"));
                        });
                    });
                }

                renderSheet(workbook.SheetNames[0]);
            })
            .catch(err => {
                console.error("XLSX render error:", err);
                const body = document.getElementById("spreadsheetBody");
                if (body) {
                    body.innerHTML = `
                        <div class="empty-state" style="padding: 40px 20px;">
                            <div style="font-size: 2.5rem; margin-bottom: 12px;">📊</div>
                            <h4 style="color:#fff;">Could Not Render Spreadsheet</h4>
                            <p style="font-size:0.85rem; color:var(--text-muted); max-width:400px; margin: 8px auto 20px;">
                                ${this.escapeHtml(err.message || 'Stream error')}
                            </p>
                            <a href="${file.download_url}" class="btn-primary">Download ${file.formatted_size}</a>
                        </div>
                    `;
                }
            });
    }

    renderPdfViewer(file) {
        const streamUrl = file.stream_url;

        // Fallback to object/iframe if PDF.js is unavailable
        if (!window.pdfjsLib) {
            this.previewContainer.innerHTML = `
                <object data="${streamUrl}#toolbar=1" type="application/pdf" class="preview-pdf-frame">
                    <iframe src="${streamUrl}#toolbar=1" class="preview-pdf-frame" title="PDF Preview"></iframe>
                </object>
            `;
            return;
        }

        // Configure PDF.js worker from local static assets
        try {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/static/vendor/pdfjs/pdf.worker.min.js";
        } catch (e) {}

        this.previewContainer.innerHTML = `
            <div class="pdf-viewer-wrapper" id="pdfViewerWrapper">
                <div class="pdf-toolbar">
                    <div class="pdf-toolbar-group">
                        <button type="button" class="pdf-btn" id="pdfPrevPage" title="Previous Page (Left Arrow)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div class="pdf-page-indicator">
                            <span>Page</span>
                            <input type="number" id="pdfPageInput" min="1" value="1" class="pdf-page-input">
                            <span class="pdf-page-separator">/</span>
                            <span id="pdfTotalPages">--</span>
                        </div>
                        <button type="button" class="pdf-btn" id="pdfNextPage" title="Next Page (Right Arrow)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>
                    </div>

                    <div class="pdf-toolbar-group">
                        <button type="button" class="pdf-btn" id="pdfZoomOut" title="Zoom Out (-)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                        </button>
                        <span id="pdfZoomLabel" class="pdf-zoom-label">100%</span>
                        <button type="button" class="pdf-btn" id="pdfZoomIn" title="Zoom In (+)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                        </button>
                        <button type="button" class="pdf-btn pdf-btn-pill" id="pdfFitWidth" title="Fit to Container Width">
                            Fit Width
                        </button>
                    </div>

                    <div class="pdf-toolbar-group">
                        <a href="${streamUrl}" target="_blank" rel="noopener noreferrer" class="pdf-btn pdf-btn-pill" title="Open in browser native viewer (new tab)">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            <span>Native Tab</span>
                        </a>
                    </div>
                </div>

                <div class="pdf-canvas-viewport" id="pdfCanvasViewport">
                    <div class="preview-spinner" id="pdfLoadingSpinner" style="padding: 60px 0;">
                        <div class="spinner-ring"></div>
                        <span style="margin-top:12px; color:var(--text-muted); font-size:0.9rem;">Rendering PDF document...</span>
                    </div>
                    <div id="pdfCanvasContainer" class="pdf-canvas-container" style="display:none;">
                        <canvas id="pdfCanvas" class="pdf-canvas"></canvas>
                    </div>
                </div>
            </div>
        `;

        const wrapper = document.getElementById("pdfViewerWrapper");
        const viewport = document.getElementById("pdfCanvasViewport");
        const canvasContainer = document.getElementById("pdfCanvasContainer");
        const canvas = document.getElementById("pdfCanvas");
        const ctx = canvas.getContext("2d");
        const spinner = document.getElementById("pdfLoadingSpinner");
        const prevBtn = document.getElementById("pdfPrevPage");
        const nextBtn = document.getElementById("pdfNextPage");
        const pageInput = document.getElementById("pdfPageInput");
        const totalPagesEl = document.getElementById("pdfTotalPages");
        const zoomInBtn = document.getElementById("pdfZoomIn");
        const zoomOutBtn = document.getElementById("pdfZoomOut");
        const zoomLabel = document.getElementById("pdfZoomLabel");
        const fitWidthBtn = document.getElementById("pdfFitWidth");

        let pdfDoc = null;
        let currentPageNum = 1;
        let currentScale = 1.25;
        let isRendering = false;
        let pendingPageNum = null;

        const renderPage = (num) => {
            if (!pdfDoc) return;
            isRendering = true;

            pdfDoc.getPage(num).then((page) => {
                const pixelRatio = window.devicePixelRatio || 1;
                const scaledViewport = page.getViewport({ scale: currentScale });

                canvas.height = Math.floor(scaledViewport.height * pixelRatio);
                canvas.width = Math.floor(scaledViewport.width * pixelRatio);
                canvas.style.height = `${Math.floor(scaledViewport.height)}px`;
                canvas.style.width = `${Math.floor(scaledViewport.width)}px`;

                const transform = pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : null;

                const renderContext = {
                    canvasContext: ctx,
                    viewport: scaledViewport,
                    transform: transform
                };

                const renderTask = page.render(renderContext);
                renderTask.promise.then(() => {
                    isRendering = false;
                    if (pendingPageNum !== null) {
                        const nextNum = pendingPageNum;
                        pendingPageNum = null;
                        renderPage(nextNum);
                    }
                });

                // Update UI state
                currentPageNum = num;
                if (pageInput) pageInput.value = num;
                if (prevBtn) prevBtn.disabled = num <= 1;
                if (nextBtn) nextBtn.disabled = num >= pdfDoc.numPages;
                if (zoomLabel) zoomLabel.textContent = `${Math.round(currentScale * 100)}%`;
            }).catch((err) => {
                isRendering = false;
                console.error("PDF page render error:", err);
            });
        };

        const queueRenderPage = (num) => {
            if (isRendering) {
                pendingPageNum = num;
            } else {
                renderPage(num);
            }
        };

        // Fetch & Load Document
        const loadingTask = window.pdfjsLib.getDocument({
            url: streamUrl,
            withCredentials: true
        });

        loadingTask.promise.then((doc) => {
            pdfDoc = doc;
            if (totalPagesEl) totalPagesEl.textContent = doc.numPages;
            if (pageInput) pageInput.max = doc.numPages;

            if (spinner) spinner.style.display = "none";
            if (canvasContainer) canvasContainer.style.display = "flex";

            // Calculate fit-width initial scale if viewport width is available
            if (viewport && viewport.clientWidth > 100) {
                doc.getPage(1).then((firstPage) => {
                    const vp = firstPage.getViewport({ scale: 1.0 });
                    const targetWidth = Math.min(viewport.clientWidth - 48, 850);
                    if (vp.width > 0 && targetWidth > 200) {
                        currentScale = Math.max(0.6, Math.min(2.0, targetWidth / vp.width));
                    }
                    renderPage(1);
                });
            } else {
                renderPage(1);
            }
        }).catch((err) => {
            console.error("PDF.js loading error:", err);
            if (wrapper) {
                wrapper.innerHTML = `
                    <div class="empty-state" style="padding: 40px 20px;">
                        <div style="font-size: 2.8rem; margin-bottom: 12px;">📑</div>
                        <h4 style="color: #fff; margin-bottom: 8px;">PDF Direct Stream Notice</h4>
                        <p style="font-size: 0.88rem; color: var(--text-muted); max-width: 440px; margin: 0 auto 20px; line-height: 1.5;">
                            ${this.escapeHtml(file.filename)}<br>
                            <span style="font-size:0.8rem; opacity:0.8;">The file stream encountered an upstream response. You can view it in the native browser tab or download it directly.</span>
                        </p>
                        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                            <a href="${streamUrl}" target="_blank" class="btn-secondary" style="padding:8px 18px;">
                                🌐 Open in Native Tab
                            </a>
                            <a href="${file.download_url}" class="btn-primary" style="padding:8px 18px;">
                                ⬇️ Direct Download (${file.formatted_size})
                            </a>
                        </div>
                    </div>
                `;
            }
        });

        // Event Listeners for Toolbar
        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPageNum > 1) queueRenderPage(currentPageNum - 1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (pdfDoc && currentPageNum < pdfDoc.numPages) queueRenderPage(currentPageNum + 1);
            });
        }

        if (pageInput) {
            pageInput.addEventListener("change", (e) => {
                const target = parseInt(e.target.value, 10);
                if (pdfDoc && target >= 1 && target <= pdfDoc.numPages) {
                    queueRenderPage(target);
                } else {
                    e.target.value = currentPageNum;
                }
            });
            pageInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    pageInput.blur();
                }
            });
        }

        if (zoomInBtn) {
            zoomInBtn.addEventListener("click", () => {
                if (currentScale < 3.0) {
                    currentScale = Math.min(3.0, currentScale + 0.25);
                    queueRenderPage(currentPageNum);
                }
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener("click", () => {
                if (currentScale > 0.5) {
                    currentScale = Math.max(0.5, currentScale - 0.25);
                    queueRenderPage(currentPageNum);
                }
            });
        }

        if (fitWidthBtn) {
            fitWidthBtn.addEventListener("click", () => {
                if (pdfDoc && viewport) {
                    pdfDoc.getPage(currentPageNum).then((p) => {
                        const vp = p.getViewport({ scale: 1.0 });
                        const targetWidth = viewport.clientWidth - 48;
                        if (vp.width > 0 && targetWidth > 200) {
                            currentScale = Math.max(0.5, Math.min(3.0, targetWidth / vp.width));
                            queueRenderPage(currentPageNum);
                        }
                    });
                }
            });
        }

        // Keyboard arrow navigation while modal is active
        if (this._pdfKeyHandler) {
            document.removeEventListener("keydown", this._pdfKeyHandler);
        }
        this._pdfKeyHandler = (e) => {
            if (!this.modal || !this.modal.classList.contains("open")) return;
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

            if (e.key === "ArrowLeft" || e.key === "PageUp") {
                if (currentPageNum > 1) {
                    e.preventDefault();
                    queueRenderPage(currentPageNum - 1);
                }
            } else if (e.key === "ArrowRight" || e.key === "PageDown") {
                if (pdfDoc && currentPageNum < pdfDoc.numPages) {
                    e.preventDefault();
                    queueRenderPage(currentPageNum + 1);
                }
            }
        };
        document.addEventListener("keydown", this._pdfKeyHandler);
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
