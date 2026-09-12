/**
 * StealthVault - Help Desk & Support Ticket System Client Logic
 * Handles ticket creation, tracking, status display, and modal state.
 * Strictly username and ticket-id based (no email/phone required).
 */

let lastGeneratedTicketId = "";

/**
 * Opens the Help Desk modal
 * @param {string} defaultCategory - Optional category to pre-select (e.g. 'password_reset')
 */
function openHelpDeskModal(defaultCategory = null) {
    const modal = document.getElementById("helpDeskModal");
    if (!modal) return;

    modal.style.display = "flex";
    modal.classList.add("modal-active");

    if (defaultCategory) {
        const catSelect = document.getElementById("ticketCategory");
        if (catSelect) catSelect.value = defaultCategory;
    }

    // Auto-focus username if on raise tab
    const userInp = document.getElementById("ticketUsername");
    if (userInp && !userInp.value) {
        setTimeout(() => userInp.focus(), 150);
    }
}

/**
 * Closes the Help Desk modal
 */
function closeHelpDeskModal() {
    const modal = document.getElementById("helpDeskModal");
    if (!modal) return;
    modal.style.display = "none";
    modal.classList.remove("modal-active");
}

/**
 * Switches between Help Desk tabs ('raise' or 'track')
 */
function switchHelpDeskTab(tab) {
    const tabRaiseBtn = document.getElementById("helpTabRaiseBtn");
    const tabTrackBtn = document.getElementById("helpTabTrackBtn");
    const panelRaise = document.getElementById("helpDeskPanel_raise");
    const panelTrack = document.getElementById("helpDeskPanel_track");

    if (tab === "track") {
        tabTrackBtn.classList.add("active");
        tabRaiseBtn.classList.remove("active");
        panelTrack.classList.remove("hidden");
        panelTrack.classList.add("active");
        panelRaise.classList.add("hidden");
        panelRaise.classList.remove("active");

        const trackInput = document.getElementById("trackTicketInput");
        if (trackInput) setTimeout(() => trackInput.focus(), 100);
    } else {
        tabRaiseBtn.classList.add("active");
        tabTrackBtn.classList.remove("active");
        panelRaise.classList.remove("hidden");
        panelRaise.classList.add("active");
        panelTrack.classList.add("hidden");
        panelTrack.classList.remove("active");
    }
}

/**
 * Copies the freshly generated Ticket ID to clipboard
 */
function copyGeneratedTicketId() {
    let ticketId = (lastGeneratedTicketId || "").trim();
    const idBadge = document.getElementById("newTicketIdBadge");
    if (idBadge && idBadge.textContent) {
        const badgeText = idBadge.textContent.trim();
        if (badgeText && badgeText !== "TK-00000") {
            ticketId = badgeText;
        }
    }
    if (!ticketId) return;

    // Reliable clipboard copy supporting both modern Clipboard API & textarea fallback
    if (navigator.clipboard) {
        navigator.clipboard.writeText(ticketId).catch(() => {});
    }

    try {
        const ta = document.createElement("textarea");
        ta.value = ticketId;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    } catch (err) {}

    // Visual button & badge feedback
    const btn = document.getElementById("copyNewTicketIdBtn");
    if (btn) {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <span style="color: #10b981; font-weight: 700;">Copied!</span>`;
        btn.style.borderColor = "#10b981";
        btn.style.background = "rgba(16, 185, 129, 0.15)";
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.style.borderColor = "";
            btn.style.background = "";
        }, 2200);
    }

    if (idBadge) {
        idBadge.style.boxShadow = "0 0 20px rgba(16, 185, 129, 0.6)";
        setTimeout(() => { idBadge.style.boxShadow = ""; }, 1500);
    }

    if (typeof window.showToast === "function") {
        window.showToast(`Ticket ID ${ticketId} copied to clipboard!`, "success");
    }
}

/**
 * Switches to Track tab and immediately tracks the generated ticket
 */
function goToTrackTicketWithId() {
    if (!lastGeneratedTicketId) return;
    switchHelpDeskTab("track");
    const trackInput = document.getElementById("trackTicketInput");
    if (trackInput) {
        trackInput.value = lastGeneratedTicketId;
        performTrackTicket();
    }
}

/**
 * Resets the raise ticket form to allow another submission
 */
function resetRaiseTicketForm() {
    const form = document.getElementById("raiseTicketForm");
    const successCard = document.getElementById("ticketSubmitSuccessCard");
    const errorBox = document.getElementById("ticketSubmitError");
    if (form) {
        form.reset();
        form.classList.remove("hidden");
    }
    if (successCard) successCard.classList.add("hidden");
    if (errorBox) errorBox.classList.add("hidden");
}

/**
 * Performs ticket status lookup by Ticket ID or Username
 */
async function performTrackTicket() {
    const input = document.getElementById("trackTicketInput");
    const container = document.getElementById("trackResultContainer");
    const emptyState = document.getElementById("trackEmptyState");
    const btn = document.getElementById("trackTicketBtn");

    if (!input || !container) return;
    const query = input.value.trim();

    if (!query) {
        input.focus();
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-inline"></span> <span>Searching...</span>`;
    }

    try {
        // If it starts with TK- or has 5+ digits, search by ticket_id
        const isTicketId = query.toUpperCase().startsWith("TK-") || /^TK/i.test(query) || /^\d{5}/.test(query);
        let endpoint = `/api/tickets/track/${encodeURIComponent(query.toUpperCase().startsWith("TK-") ? query : "TK-" + query)}`;
        
        let res = await fetch(endpoint);
        let data = await res.json();

        // If direct ticket lookup failed and query doesn't strictly look like a Ticket ID, try lookup by username
        if (!data.success && !query.toUpperCase().startsWith("TK-")) {
            const userRes = await fetch(`/api/tickets/by-username/${encodeURIComponent(query)}`);
            const userData = await userRes.json();
            if (userData.success && userData.tickets && userData.tickets.length > 0) {
                renderMultipleTicketsResult(userData.tickets, query);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> <span>Track Status</span>`;
                }
                return;
            }
        }

        if (data.success && data.ticket) {
            renderSingleTicketResult(data.ticket);
        } else {
            emptyState.classList.remove("hidden");
            container.classList.add("hidden");
            emptyState.innerHTML = `
                <div class="empty-icon" style="color: #f43f5e;">✕</div>
                <h4 style="color: #fca5a5; margin: 8px 0;">No Ticket Found</h4>
                <p class="empty-text">${escapeHtml(data.error || `No ticket found matching '${query}'. Please check your Ticket ID.`)}</p>
            `;
        }
    } catch (err) {
        emptyState.classList.remove("hidden");
        container.classList.add("hidden");
        emptyState.innerHTML = `
            <div class="empty-icon" style="color: #f43f5e;">⚠️</div>
            <h4 style="color: #fca5a5; margin: 8px 0;">Connection Error</h4>
            <p class="empty-text">Failed to query ticket status. Please check your connection and try again.</p>
        `;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> <span>Track Status</span>`;
        }
    }
}

/**
 * Formats Category text for display
 */
function formatTicketCategory(cat) {
    const map = {
        "password_reset": "🔑 Password Reset",
        "account_access": "🔒 Account Access",
        "file_issue": "📁 File Access Issue",
        "bug_issue": "🐛 Technical Bug",
        "other": "💬 General Inquiry"
    };
    return map[cat] || cat;
}

/**
 * Returns badge markup for ticket status
 */
function getStatusBadgeMarkup(status) {
    const s = (status || "open").toLowerCase();
    if (s === "resolved") {
        return `<span class="ticket-status-badge status-resolved">✓ Resolved</span>`;
    } else if (s === "in_progress") {
        return `<span class="ticket-status-badge status-inprogress">⚡ In Progress</span>`;
    } else if (s === "closed") {
        return `<span class="ticket-status-badge status-closed">✕ Closed</span>`;
    } else {
        return `<span class="ticket-status-badge status-open">⏳ Pending Review</span>`;
    }
}

/**
 * Renders a single ticket status card
 */
function renderSingleTicketResult(ticket) {
    const container = document.getElementById("trackResultContainer");
    const emptyState = document.getElementById("trackEmptyState");
    if (!container || !emptyState) return;

    emptyState.classList.add("hidden");
    container.classList.remove("hidden");

    const createdDate = ticket.created_at ? new Date(ticket.created_at).toLocaleString() : "Recently";
    const resolvedDate = ticket.resolved_at ? new Date(ticket.resolved_at).toLocaleString() : null;

    // Check if admin reply includes a new password
    let passwordExtractHtml = "";
    if (ticket.admin_reply) {
        const passMatch = ticket.admin_reply.match(/(?:reset to|password is|password:)\s*([A-Za-z0-9@#$%^&*!_+=-]{6,})/i);
        if (passMatch && passMatch[1]) {
            const extractedPass = passMatch[1].trim();
            passwordExtractHtml = `
                <div class="extracted-pass-card">
                    <div class="pass-info-left">
                        <span class="pass-title">🔑 Your New Password</span>
                        <code class="pass-code" id="extractedPassVal">${escapeHtml(extractedPass)}</code>
                    </div>
                    <div class="pass-actions">
                        <button type="button" class="btn-primary btn-sm" onclick="copyExtractedPassword('${escapeHtml(extractedPass)}')">
                            <span>Copy Password</span>
                        </button>
                        <a href="/login" class="btn-secondary btn-sm" style="text-decoration: none;">
                            <span>Sign In Now</span>
                        </a>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = `
        <div class="ticket-card-view glass-panel">
            <div class="ticket-view-header">
                <div class="ticket-id-title-box">
                    <span class="ticket-id-pill">${escapeHtml(ticket.ticket_id)}</span>
                    <span class="ticket-category-pill">${formatTicketCategory(ticket.category)}</span>
                </div>
                <div>
                    ${getStatusBadgeMarkup(ticket.status)}
                </div>
            </div>

            <div class="ticket-view-meta">
                <div class="meta-item">
                    <span class="meta-lbl">Username:</span>
                    <span class="meta-val"><strong>${escapeHtml(ticket.username)}</strong></span>
                </div>
                <div class="meta-item">
                    <span class="meta-lbl">Submitted:</span>
                    <span class="meta-val">${createdDate}</span>
                </div>
                ${resolvedDate ? `
                <div class="meta-item">
                    <span class="meta-lbl">Resolved:</span>
                    <span class="meta-val text-emerald">${resolvedDate}</span>
                </div>` : ''}
            </div>

            <div class="ticket-view-body">
                <h4 class="ticket-subject-heading">${escapeHtml(ticket.subject)}</h4>
                <div class="ticket-message-text">${escapeHtml(ticket.message)}</div>
            </div>

            ${passwordExtractHtml}

            <!-- Admin Reply Box -->
            <div class="ticket-admin-reply-box ${ticket.admin_reply ? 'has-reply' : 'pending-reply'}">
                <div class="reply-header">
                    <div class="reply-badge">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                        <span>Administrator Response</span>
                    </div>
                    ${resolvedDate ? `<span class="reply-time">${resolvedDate}</span>` : ''}
                </div>
                <div class="reply-content">
                    ${ticket.admin_reply 
                        ? `<p class="reply-message-body">${escapeHtml(ticket.admin_reply).replace(/\n/g, '<br>')}</p>`
                        : `<p class="reply-pending-text">⏳ Your request is currently under review by the Administrator. As soon as the issue is resolved or your password is reset, the response will appear right here. Please keep your Ticket ID (<strong>${escapeHtml(ticket.ticket_id)}</strong>) to check back anytime.</p>`
                    }
                </div>
            </div>
        </div>
    `;
}

/**
 * Copies the extracted password to clipboard
 */
function copyExtractedPassword(pass) {
    navigator.clipboard.writeText(pass).then(() => {
        alert("New password copied to clipboard! You can now sign in.");
    }).catch(() => {
        alert(`Password: ${pass}`);
    });
}

/**
 * Renders multiple tickets when searching by username
 */
function renderMultipleTicketsResult(tickets, username) {
    const container = document.getElementById("trackResultContainer");
    const emptyState = document.getElementById("trackEmptyState");
    if (!container || !emptyState) return;

    emptyState.classList.add("hidden");
    container.classList.remove("hidden");

    let listHtml = tickets.map(t => {
        const dt = t.created_at ? new Date(t.created_at).toLocaleDateString() : "";
        return `
            <div class="user-ticket-row glass-panel" onclick="loadSpecificTicket('${escapeHtml(t.ticket_id)}')">
                <div class="row-left">
                    <div class="row-top">
                        <span class="ticket-id-pill">${escapeHtml(t.ticket_id)}</span>
                        <span class="ticket-cat-text">${formatTicketCategory(t.category)}</span>
                        <span class="ticket-date-text">${dt}</span>
                    </div>
                    <div class="row-subject">${escapeHtml(t.subject)}</div>
                </div>
                <div class="row-right">
                    ${getStatusBadgeMarkup(t.status)}
                    <button type="button" class="btn-ghost btn-sm">View Details →</button>
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div class="multiple-tickets-view">
            <div class="multi-header">
                <h4>Tickets for User: <strong>${escapeHtml(username)}</strong> (${tickets.length})</h4>
                <p>Click any ticket below to view the administrator's reply and full resolution details:</p>
            </div>
            <div class="tickets-list-grid">
                ${listHtml}
            </div>
        </div>
    `;
}

function loadSpecificTicket(ticketId) {
    const input = document.getElementById("trackTicketInput");
    if (input) {
        input.value = ticketId;
        performTrackTicket();
    }
}

/**
 * Helper to escape HTML characters safely
 */
function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Global DOM event listener setup
document.addEventListener("DOMContentLoaded", () => {
    // 1. Raise Ticket Form Submit Handler
    const raiseForm = document.getElementById("raiseTicketForm");
    if (raiseForm) {
        raiseForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const username = document.getElementById("ticketUsername").value.trim();
            const category = document.getElementById("ticketCategory").value;
            const message = document.getElementById("ticketMessage").value.trim();
            const errorBox = document.getElementById("ticketSubmitError");
            const errorText = document.getElementById("ticketSubmitErrorText");
            const submitBtn = document.getElementById("submitTicketBtn");

            if (!username) {
                if (errorBox) {
                    errorText.textContent = "Please enter your username.";
                    errorBox.classList.remove("hidden");
                }
                return;
            }

            if (!message || message.length < 5) {
                if (errorBox) {
                    errorText.textContent = "Please describe your issue or requirement (at least 5 characters).";
                    errorBox.classList.remove("hidden");
                }
                return;
            }

            // Derive subject automatically from category and message
            const catMap = {
                "password_reset": "Password Reset Request",
                "account_access": "Account Login Issue",
                "file_issue": "File Storage Issue",
                "bug_issue": "Technical Bug Report",
                "other": "General Support Inquiry"
            };
            const firstLine = message.split("\n")[0].trim();
            const subject = firstLine.length <= 60 ? firstLine : (catMap[category] || "Support Request");

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<span class="spinner-inline"></span> <span>Submitting...</span>`;
            }
            if (errorBox) errorBox.classList.add("hidden");

            try {
                const res = await fetch("/api/tickets/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, category, subject, message })
                });

                const data = await res.json();

                if (res.ok && data.success) {
                    lastGeneratedTicketId = data.ticket_id;
                    const successCard = document.getElementById("ticketSubmitSuccessCard");
                    const idBadge = document.getElementById("newTicketIdBadge");

                    if (idBadge) idBadge.textContent = data.ticket_id;
                    if (raiseForm) raiseForm.classList.add("hidden");
                    if (successCard) successCard.classList.remove("hidden");
                } else {
                    if (errorBox) {
                        errorText.textContent = data.error || "Failed to submit ticket. Please check your inputs.";
                        errorBox.classList.remove("hidden");
                    }
                }
            } catch (err) {
                if (errorBox) {
                    errorText.textContent = "Network error. Please verify your connection and try again.";
                    errorBox.classList.remove("hidden");
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<span>Submit Support Ticket</span> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
                }
            }
        });
    }

    // 2. Track Ticket Enter Key Support
    const trackInput = document.getElementById("trackTicketInput");
    if (trackInput) {
        trackInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                performTrackTicket();
            }
        });
    }

    // 3. Modal Backdrop Click to Close
    const modal = document.getElementById("helpDeskModal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                closeHelpDeskModal();
            }
        });
    }
});
