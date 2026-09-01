/**
 * Stealth Cloud Vault - Admin Control Dashboard JavaScript
 * Multi-Select Batch Actions & Modal Support
 */
document.addEventListener("DOMContentLoaded", () => {
    // Top Stats
    const adminTotalUsers = document.getElementById("adminTotalUsers");
    const adminTotalFiles = document.getElementById("adminTotalFiles");
    const adminTotalStorage = document.getElementById("adminTotalStorage");
    const refreshAdminBtn = document.getElementById("refreshAdminBtn");

    // Tab buttons
    const adminTabUsersBtn = document.getElementById("adminTabUsersBtn");
    const adminTabFilesBtn = document.getElementById("adminTabFilesBtn");
    const adminUsersSection = document.getElementById("adminUsersSection");
    const adminFilesSection = document.getElementById("adminFilesSection");

    // User table elements
    const usersTableBody = document.getElementById("usersTableBody");
    const adminUserSearch = document.getElementById("adminUserSearch");
    const userCountBadge = document.getElementById("userCountBadge");

    // File table elements
    const adminFilesTableBody = document.getElementById("adminFilesTableBody");
    const adminFileSearch = document.getElementById("adminFileSearch");
    const fileCountBadge = document.getElementById("fileCountBadge");
    const claimAllFilesBtn = document.getElementById("claimAllFilesBtn");
    const selectAllAdminFiles = document.getElementById("selectAllAdminFiles");
    const adminFilesBatchBar = document.getElementById("adminFilesBatchBar");
    const selectedFilesCount = document.getElementById("selectedFilesCount");
    const batchAssignBtn = document.getElementById("batchAssignBtn");
    const batchDeleteBtn = document.getElementById("batchDeleteBtn");
    const clearSelectedFilesBtn = document.getElementById("clearSelectedFilesBtn");

    // Password Modal elements
    const resetModal = document.getElementById("resetPasswordModal");
    const resetForm = document.getElementById("resetPasswordForm");
    const targetUserIdInput = document.getElementById("targetUserId");
    const resetModalSubtitle = document.getElementById("resetModalSubtitle");
    const newPasswordInput = document.getElementById("newPasswordInput");
    const generateRandomPassBtn = document.getElementById("generateRandomPassBtn");
    const generatedPassNotice = document.getElementById("generatedPassNotice");
    const displayCopiedPass = document.getElementById("displayCopiedPass");
    const copyPassBtn = document.getElementById("copyPassBtn");
    const closeResetModalBtn = document.getElementById("closeResetModalBtn");
    const cancelResetBtn = document.getElementById("cancelResetBtn");

    // Assign File Modal elements
    const assignModal = document.getElementById("assignFileModal");
    const assignForm = document.getElementById("assignFileForm");
    const assignFileSubtitle = document.getElementById("assignFileSubtitle");
    const assignUserSelect = document.getElementById("assignUserSelect");
    const closeAssignModalBtn = document.getElementById("closeAssignModalBtn");
    const cancelAssignBtn = document.getElementById("cancelAssignBtn");

    // User Data Management Modal elements
    const userDataModal = document.getElementById("userDataModal");
    const manageTargetUserId = document.getElementById("manageTargetUserId");
    const manageUsername = document.getElementById("manageUsername");
    const manageUserFilesCount = document.getElementById("manageUserFilesCount");
    const manageUserStorage = document.getElementById("manageUserStorage");
    const userFilesManageBody = document.getElementById("userFilesManageBody");
    const sendNoticeForm = document.getElementById("sendNoticeForm");
    const noticeDeadlineInput = document.getElementById("noticeDeadlineInput");
    const noticeTitleInput = document.getElementById("noticeTitleInput");
    const noticeMessageInput = document.getElementById("noticeMessageInput");
    const purgeDaysSelect = document.getElementById("purgeDaysSelect");
    const purgeOldFilesBtn = document.getElementById("purgeOldFilesBtn");
    const closeUserDataModalBtn = document.getElementById("closeUserDataModalBtn");
    const closeUserDataModalBottomBtn = document.getElementById("closeUserDataModalBottomBtn");
    const selectAllUserModalFiles = document.getElementById("selectAllUserModalFiles");
    const userFilesBatchBar = document.getElementById("userFilesBatchBar");
    const userSelectedCount = document.getElementById("userSelectedCount");
    const userBatchDeleteBtn = document.getElementById("userBatchDeleteBtn");

    let allUsers = [];
    let allFiles = [];
    let selectedFileIds = new Set();
    let userSelectedFileIds = new Set();
    let currentAssignFileIds = [];

    // Helper: Close modals on backdrop click
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.classList.add("hidden");
            }
        });
    });

    // 1. Tab Switching
    if (adminTabUsersBtn && adminTabFilesBtn) {
        adminTabUsersBtn.addEventListener("click", () => {
            adminTabUsersBtn.classList.add("active");
            adminTabFilesBtn.classList.remove("active");
            adminUsersSection.classList.remove("hidden");
            adminFilesSection.classList.add("hidden");
        });

        adminTabFilesBtn.addEventListener("click", () => {
            adminTabFilesBtn.classList.add("active");
            adminTabUsersBtn.classList.remove("active");
            adminFilesSection.classList.remove("hidden");
            adminUsersSection.classList.add("hidden");
        });
    }

    // 2. Fetch & Render Admin Data
    async function loadAdminData() {
        try {
            // Load stats
            const statsRes = await fetch("/api/admin/stats");
            if (statsRes.ok) {
                const stats = await statsRes.json();
                adminTotalUsers.textContent = stats.total_users || 0;
                adminTotalFiles.textContent = stats.total_files || 0;
                adminTotalStorage.textContent = formatBytes(stats.total_bytes || 0);
            }

            // Load users
            const usersRes = await fetch("/api/admin/users");
            if (usersRes.ok) {
                const data = await usersRes.json();
                allUsers = data.users || [];
                renderUsers(allUsers);
                updateUserSelectDropdown(allUsers);
            } else if (usersRes.status === 403) {
                window.location.href = "/admin/login";
            }

            // Load all files (including legacy unassigned)
            const filesRes = await fetch("/api/admin/files");
            if (filesRes.ok) {
                const fileData = await filesRes.json();
                allFiles = fileData.files || [];
                selectedFileIds.clear();
                updateBatchBar();
                renderFiles(allFiles);
            }
        } catch (err) {
            console.error("Admin data load error:", err);
            window.showToast("Failed to load admin metrics", "error");
        }
    }

    function renderUsers(users) {
        userCountBadge.textContent = `${users.length} User${users.length === 1 ? '' : 's'}`;

        if (users.length === 0) {
            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-6 text-muted">No users found matching your search.</td>
                </tr>
            `;
            return;
        }

        usersTableBody.innerHTML = users.map(user => {
            const joinedDate = user.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A";
            const storageFormatted = formatBytes(user.total_bytes || 0);
            const userInitial = (user.username || 'U').charAt(0).toUpperCase();

            return `
                <tr class="user-row">
                    <td>
                        <div class="user-cell">
                            <div class="avatar-circle ${user.is_admin ? 'admin-avatar' : ''}">${userInitial}</div>
                            <div>
                                <div class="user-name-text">${escapeHtml(user.username)}</div>
                                <div class="user-id-text">ID: #${user.id}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="user-email-text">${escapeHtml(user.email)}</span></td>
                    <td>
                        <span class="role-badge ${user.is_admin ? 'role-admin' : 'role-user'}">
                            ${user.is_admin ? 'Admin' : 'User'}
                        </span>
                    </td>
                    <td><span class="metric-highlight">${user.total_files || 0}</span> files</td>
                    <td><span class="metric-highlight">${storageFormatted}</span></td>
                    <td class="text-muted text-sm">${joinedDate}</td>
                    <td class="text-right">
                        <div class="action-buttons-group">
                            <button class="btn-action manage-data-btn" data-id="${user.id}" data-username="${escapeHtml(user.username)}" title="Manage User Data & Send Notice" style="color: var(--purple-primary); border-color: rgba(168, 85, 247, 0.4); background: rgba(168, 85, 247, 0.1);">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                    <circle cx="12" cy="7" r="4"/>
                                </svg>
                                <span>Data & Notice</span>
                            </button>
                            <button class="btn-action reset-pass-btn" data-id="${user.id}" data-username="${escapeHtml(user.username)}" title="Reset Password">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </svg>
                                <span>Reset Pass</span>
                            </button>
                            ${!user.is_admin ? `
                                <button class="btn-action-delete delete-user-btn" data-id="${user.id}" data-username="${escapeHtml(user.username)}" title="Delete User">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"/>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    </svg>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        document.querySelectorAll(".manage-data-btn").forEach(btn => {
            btn.addEventListener("click", () => openUserDataModal(btn.dataset.id, btn.dataset.username));
        });

        document.querySelectorAll(".reset-pass-btn").forEach(btn => {
            btn.addEventListener("click", () => openResetModal(btn.dataset.id, btn.dataset.username));
        });

        document.querySelectorAll(".delete-user-btn").forEach(btn => {
            btn.addEventListener("click", () => handleDeleteUser(btn.dataset.id, btn.dataset.username));
        });
    }

    function renderFiles(files) {
        fileCountBadge.textContent = `${files.length} File${files.length === 1 ? '' : 's'}`;

        if (files.length === 0) {
            adminFilesTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-6 text-muted">No vault files found in the database.</td>
                </tr>
            `;
            if (selectAllAdminFiles) selectAllAdminFiles.checked = false;
            return;
        }

        adminFilesTableBody.innerHTML = files.map(file => {
            const dateStr = file.created_at ? new Date(file.created_at).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A";
            const sizeStr = formatBytes(file.file_size || 0);
            const isChecked = selectedFileIds.has(file.id);

            const isUnassigned = file.is_unassigned;
            const ownerHtml = isUnassigned 
                ? `<span class="role-badge" style="background: rgba(245, 158, 11, 0.15); color: var(--amber-primary); border: 1px solid rgba(245, 158, 11, 0.3);">⚠️ Unassigned (Legacy)</span>`
                : `<span class="role-badge role-user" style="color: var(--cyan-primary);">@${escapeHtml(file.owner_username)}</span>`;

            return `
                <tr class="user-row ${isChecked ? 'selected-row' : ''}">
                    <td style="text-align: center;">
                        <input type="checkbox" class="file-checkbox custom-checkbox" data-id="${file.id}" ${isChecked ? 'checked' : ''}>
                    </td>
                    <td>
                        <div class="user-cell">
                            <div class="stat-icon-wrapper cyan" style="width: 32px; height: 32px; border-radius: 6px;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                </svg>
                            </div>
                            <div>
                                <div class="user-name-text" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</div>
                                <div class="user-id-text">ID: #${file.id} • ${escapeHtml(file.mime_type || '')}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="role-badge role-user">${escapeHtml(file.category || 'other')}</span></td>
                    <td><span class="metric-highlight">${sizeStr}</span></td>
                    <td>${ownerHtml}</td>
                    <td class="text-muted text-sm">${dateStr}</td>
                    <td class="text-right">
                        <div class="action-buttons-group">
                            <a href="/api/files/download/${file.id}" target="_blank" class="btn-action" title="Download File">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="7 10 12 15 17 10"/>
                                    <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                            </a>
                            <button type="button" class="btn-action assign-single-file-btn" data-id="${file.id}" data-filename="${escapeHtml(file.filename)}" title="Assign / Transfer to User">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                    <circle cx="8.5" cy="7" r="4"/>
                                    <polyline points="17 11 19 13 23 9"/>
                                </svg>
                                <span>Assign User</span>
                            </button>
                            <button type="button" class="btn-action-delete delete-file-btn" data-id="${file.id}" data-filename="${escapeHtml(file.filename)}" title="Delete File">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        // Checkbox events
        document.querySelectorAll(".file-checkbox").forEach(cb => {
            cb.addEventListener("change", (e) => {
                const fileId = parseInt(e.target.dataset.id, 10);
                if (e.target.checked) {
                    selectedFileIds.add(fileId);
                } else {
                    selectedFileIds.delete(fileId);
                }
                updateBatchBar();
            });
        });

        document.querySelectorAll(".assign-single-file-btn").forEach(btn => {
            btn.addEventListener("click", () => openAssignModal([parseInt(btn.dataset.id, 10)], btn.dataset.filename));
        });

        document.querySelectorAll(".delete-file-btn").forEach(btn => {
            btn.addEventListener("click", () => handleDeleteFile(btn.dataset.id, btn.dataset.filename));
        });
    }

    // Select All Checkbox Handler
    if (selectAllAdminFiles) {
        selectAllAdminFiles.addEventListener("change", (e) => {
            const isChecked = e.target.checked;
            selectedFileIds.clear();
            if (isChecked) {
                allFiles.forEach(f => selectedFileIds.add(f.id));
            }
            document.querySelectorAll(".file-checkbox").forEach(cb => {
                cb.checked = isChecked;
            });
            updateBatchBar();
        });
    }

    function updateBatchBar() {
        const count = selectedFileIds.size;
        if (!adminFilesBatchBar) return;

        if (count > 0) {
            adminFilesBatchBar.classList.remove("hidden");
            selectedFilesCount.textContent = `✅ ${count} File${count === 1 ? '' : 's'} Selected`;
        } else {
            adminFilesBatchBar.classList.add("hidden");
        }

        if (selectAllAdminFiles) {
            selectAllAdminFiles.checked = (count > 0 && count === allFiles.length);
        }
    }

    if (clearSelectedFilesBtn) {
        clearSelectedFilesBtn.addEventListener("click", () => {
            selectedFileIds.clear();
            if (selectAllAdminFiles) selectAllAdminFiles.checked = false;
            document.querySelectorAll(".file-checkbox").forEach(cb => cb.checked = false);
            updateBatchBar();
        });
    }

    // Batch Assign Click
    if (batchAssignBtn) {
        batchAssignBtn.addEventListener("click", () => {
            const ids = Array.from(selectedFileIds);
            if (ids.length === 0) return;
            openAssignModal(ids, `${ids.length} selected files`);
        });
    }

    // Batch Delete Click
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener("click", async () => {
            const ids = Array.from(selectedFileIds);
            if (ids.length === 0) return;

            if (!confirm(`Are you sure you want to permanently delete ${ids.length} selected file(s)?`)) {
                return;
            }

            try {
                const res = await fetch("/api/admin/files/batch-delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ file_ids: ids })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    window.showToast(data.message, "success");
                    loadAdminData();
                } else {
                    window.showToast(data.error || "Failed to delete files", "error");
                }
            } catch (err) {
                window.showToast("Network error during batch delete", "error");
            }
        });
    }

    function updateUserSelectDropdown(users) {
        if (!assignUserSelect) return;
        if (users.length === 0) {
            assignUserSelect.innerHTML = `<option value="">No users available</option>`;
            return;
        }
        assignUserSelect.innerHTML = users.map(u => `
            <option value="${u.id}">@${escapeHtml(u.username)} (${escapeHtml(u.email)})</option>
        `).join("");
    }

    // 3. Search Filters
    if (adminUserSearch) {
        adminUserSearch.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filtered = allUsers.filter(u => 
                u.username.toLowerCase().includes(query) || 
                u.email.toLowerCase().includes(query)
            );
            renderUsers(filtered);
        });
    }

    if (adminFileSearch) {
        adminFileSearch.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filtered = allFiles.filter(f => 
                f.filename.toLowerCase().includes(query) || 
                (f.owner_username && f.owner_username.toLowerCase().includes(query)) ||
                (f.category && f.category.toLowerCase().includes(query))
            );
            renderFiles(filtered);
        });
    }

    if (refreshAdminBtn) {
        refreshAdminBtn.addEventListener("click", () => {
            loadAdminData();
            window.showToast("Refreshed system metrics", "info");
        });
    }

    // 4. Password Reset Modal Logic
    function openResetModal(userId, username) {
        targetUserIdInput.value = userId;
        resetModalSubtitle.textContent = `Set a new password for account @${username}`;
        newPasswordInput.value = "";
        generatedPassNotice.classList.add("hidden");
        resetModal.classList.remove("hidden");
        newPasswordInput.focus();
    }

    function closeResetModal() {
        resetModal.classList.add("hidden");
    }

    if (closeResetModalBtn) closeResetModalBtn.addEventListener("click", closeResetModal);
    if (cancelResetBtn) cancelResetBtn.addEventListener("click", closeResetModal);

    if (generateRandomPassBtn) {
        generateRandomPassBtn.addEventListener("click", () => {
            const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
            let randPass = "";
            for (let i = 0; i < 10; i++) {
                randPass += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            newPasswordInput.value = randPass;
            displayCopiedPass.textContent = randPass;
            generatedPassNotice.classList.remove("hidden");
        });
    }

    if (copyPassBtn) {
        copyPassBtn.addEventListener("click", () => {
            const passToCopy = displayCopiedPass.textContent || newPasswordInput.value;
            if (passToCopy) {
                navigator.clipboard.writeText(passToCopy);
                window.showToast("Password copied to clipboard!", "success");
            }
        });
    }

    if (resetForm) {
        resetForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const userId = targetUserIdInput.value;
            const newPassword = newPasswordInput.value.trim();

            if (!newPassword || newPassword.length < 6) {
                window.showToast("Password must be at least 6 characters", "error");
                return;
            }

            try {
                const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: newPassword })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    displayCopiedPass.textContent = newPassword;
                    generatedPassNotice.classList.remove("hidden");
                    navigator.clipboard.writeText(newPassword);
                    window.showToast(`Password for '${data.username}' updated & copied!`, "success");
                    setTimeout(() => closeResetModal(), 2500);
                } else {
                    window.showToast(data.error || "Password reset failed", "error");
                }
            } catch (err) {
                window.showToast("Network error during password reset", "error");
            }
        });
    }

    // 5. Assign Files to User Modal (Supports Single & Multi-Select)
    function openAssignModal(fileIds, label) {
        currentAssignFileIds = fileIds;
        assignFileSubtitle.textContent = `Assign ${label} to selected user account`;
        assignModal.classList.remove("hidden");
    }

    function closeAssignModal() {
        assignModal.classList.add("hidden");
    }

    if (closeAssignModalBtn) closeAssignModalBtn.addEventListener("click", closeAssignModal);
    if (cancelAssignBtn) cancelAssignBtn.addEventListener("click", closeAssignModal);

    if (assignForm) {
        assignForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const targetUserId = parseInt(assignUserSelect.value, 10);

            if (!targetUserId) {
                window.showToast("Please select a target user", "error");
                return;
            }

            try {
                const res = await fetch("/api/admin/files/batch-assign", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        file_ids: currentAssignFileIds,
                        user_id: targetUserId
                    })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    window.showToast(data.message, "success");
                    closeAssignModal();
                    selectedFileIds.clear();
                    updateBatchBar();
                    loadAdminData();
                } else {
                    window.showToast(data.error || "Failed to assign file(s)", "error");
                }
            } catch (err) {
                window.showToast("Network error while assigning files", "error");
            }
        });
    }

    // 6. Claim All Unassigned Files
    if (claimAllFilesBtn) {
        claimAllFilesBtn.addEventListener("click", async () => {
            if (allUsers.length === 0) {
                window.showToast("No registered users found to assign files to", "error");
                return;
            }

            const unassignedCount = allFiles.filter(f => f.is_unassigned).length;
            if (unassignedCount === 0) {
                window.showToast("All files are already assigned to users!", "info");
                return;
            }

            const userOptions = allUsers.map((u, i) => `${i + 1}. ${u.username} (ID: ${u.id})`).join("\n");
            const chosen = prompt(`Found ${unassignedCount} unassigned legacy files.\n\nChoose target user by entering number (1 to ${allUsers.length}):\n${userOptions}`);
            
            if (!chosen) return;
            const index = parseInt(chosen.trim(), 10) - 1;
            if (isNaN(index) || index < 0 || index >= allUsers.length) {
                window.showToast("Invalid user selection", "error");
                return;
            }

            const targetUser = allUsers[index];

            try {
                const res = await fetch("/api/admin/files/claim-all", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_id: targetUser.id })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    window.showToast(data.message, "success");
                    loadAdminData();
                } else {
                    window.showToast(data.error || "Failed to assign legacy files", "error");
                }
            } catch (err) {
                window.showToast("Network error while assigning legacy files", "error");
            }
        });
    }

    // 7. Delete User & Delete File
    async function handleDeleteUser(userId, username) {
        if (!confirm(`Are you sure you want to delete user '${username}'?\nAll their uploaded files will be permanently deleted.`)) {
            return;
        }

        try {
            const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
            const data = await res.json();
            if (res.ok && data.success) {
                window.showToast(data.message, "success");
                loadAdminData();
            } else {
                window.showToast(data.error || "Failed to delete user", "error");
            }
        } catch (err) {
            window.showToast("Network error while deleting user", "error");
        }
    }

    async function handleDeleteFile(fileId, filename) {
        if (!confirm(`Are you sure you want to permanently delete '${filename}'?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
            const data = await res.json();
            if (res.ok && data.success) {
                window.showToast(data.message, "success");
                loadAdminData();
            } else {
                window.showToast(data.error || "Failed to delete file", "error");
            }
        } catch (err) {
            window.showToast("Network error while deleting file", "error");
        }
    }

    // 8. User Data Management & Deletion Notice Center Logic
    async function openUserDataModal(userId, username) {
        manageTargetUserId.value = userId;
        manageUsername.textContent = `@${username}`;
        manageUserFilesCount.textContent = "...";
        manageUserStorage.textContent = "...";
        userSelectedFileIds.clear();
        updateUserBatchBar();
        if (selectAllUserModalFiles) selectAllUserModalFiles.checked = false;

        userFilesManageBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Loading user vault data...</td></tr>`;
        
        userDataModal.classList.remove("hidden");

        try {
            const res = await fetch(`/api/admin/users/${userId}/profile`);
            const data = await res.json();
            if (res.ok && data.success) {
                const user = data.user;
                const files = data.files || [];
                manageUserFilesCount.textContent = files.length;
                manageUserStorage.textContent = formatBytes(user.total_bytes || 0);

                if (files.length === 0) {
                    userFilesManageBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">This user has no uploaded files.</td></tr>`;
                } else {
                    userFilesManageBody.innerHTML = files.map(f => {
                        const dateStr = f.created_at ? new Date(f.created_at).toLocaleDateString() : "N/A";
                        return `
                            <tr>
                                <td style="text-align: center;">
                                    <input type="checkbox" class="user-modal-file-cb custom-checkbox" data-id="${f.id}">
                                </td>
                                <td><strong style="color: var(--text-main);">${escapeHtml(f.filename)}</strong></td>
                                <td><span class="role-badge role-user">${escapeHtml(f.category)}</span></td>
                                <td><span class="metric-highlight">${formatBytes(f.file_size)}</span></td>
                                <td class="text-muted text-sm">${dateStr}</td>
                                <td class="text-right">
                                    <button type="button" class="btn-action-delete delete-user-single-file-btn" data-id="${f.id}" data-filename="${escapeHtml(f.filename)}" title="Delete this file">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="3 6 5 6 21 6"/>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                        </svg>
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join("");

                    // Checkbox change handlers
                    document.querySelectorAll(".user-modal-file-cb").forEach(cb => {
                        cb.addEventListener("change", (e) => {
                            const fileId = parseInt(e.target.dataset.id, 10);
                            if (e.target.checked) {
                                userSelectedFileIds.add(fileId);
                            } else {
                                userSelectedFileIds.delete(fileId);
                            }
                            updateUserBatchBar();
                        });
                    });

                    document.querySelectorAll(".delete-user-single-file-btn").forEach(btn => {
                        btn.addEventListener("click", () => handleDeleteUserSingleFile(btn.dataset.id, btn.dataset.filename));
                    });
                }
            } else {
                window.showToast("Failed to load user profile", "error");
            }
        } catch (err) {
            window.showToast("Network error loading user files", "error");
        }
    }

    if (selectAllUserModalFiles) {
        selectAllUserModalFiles.addEventListener("change", (e) => {
            const isChecked = e.target.checked;
            userSelectedFileIds.clear();
            document.querySelectorAll(".user-modal-file-cb").forEach(cb => {
                cb.checked = isChecked;
                if (isChecked) userSelectedFileIds.add(parseInt(cb.dataset.id, 10));
            });
            updateUserBatchBar();
        });
    }

    function updateUserBatchBar() {
        if (!userFilesBatchBar) return;
        const count = userSelectedFileIds.size;
        if (count > 0) {
            userFilesBatchBar.classList.remove("hidden");
            userSelectedCount.textContent = `✅ ${count} Selected`;
        } else {
            userFilesBatchBar.classList.add("hidden");
        }
    }

    if (userBatchDeleteBtn) {
        userBatchDeleteBtn.addEventListener("click", async () => {
            const ids = Array.from(userSelectedFileIds);
            if (ids.length === 0) return;

            if (!confirm(`Are you sure you want to permanently delete ${ids.length} selected file(s)?`)) return;

            try {
                const res = await fetch("/api/admin/files/batch-delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ file_ids: ids })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    window.showToast(data.message, "success");
                    const userId = manageTargetUserId.value;
                    const username = manageUsername.textContent.replace('@', '');
                    openUserDataModal(userId, username);
                    loadAdminData();
                } else {
                    window.showToast(data.error || "Failed to delete files", "error");
                }
            } catch (err) {
                window.showToast("Network error during batch delete", "error");
            }
        });
    }

    function closeUserDataModal() {
        userDataModal.classList.add("hidden");
    }

    if (closeUserDataModalBtn) closeUserDataModalBtn.addEventListener("click", closeUserDataModal);
    if (closeUserDataModalBottomBtn) closeUserDataModalBottomBtn.addEventListener("click", closeUserDataModal);

    // Send Warning Notice to User Form
    if (sendNoticeForm) {
        sendNoticeForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const userId = manageTargetUserId.value;
            const deadlineDays = parseInt(noticeDeadlineInput.value, 10) || 2;
            const title = noticeTitleInput.value.trim();
            const message = noticeMessageInput.value.trim();

            try {
                const res = await fetch(`/api/admin/users/${userId}/notice`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: title,
                        message: message,
                        deadline_days: deadlineDays
                    })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    window.showToast(`Popup Deletion Notice sent to user! (${deadlineDays}-day deadline)`, "success");
                } else {
                    window.showToast(data.error || "Failed to send notice", "error");
                }
            } catch (err) {
                window.showToast("Network error sending warning notice", "error");
            }
        });
    }

    // Purge Old Files Button
    if (purgeOldFilesBtn) {
        purgeOldFilesBtn.addEventListener("click", async () => {
            const userId = manageTargetUserId.value;
            const days = parseInt(purgeDaysSelect.value, 10);
            const username = manageUsername.textContent;

            const timeText = days === 0 ? "ALL files" : `files older than ${days} days`;
            if (!confirm(`Are you sure you want to permanently delete ${timeText} for ${username}?`)) {
                return;
            }

            try {
                const res = await fetch(`/api/admin/users/${userId}/purge-old`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ days: days })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    window.showToast(data.message, "success");
                    openUserDataModal(userId, username.replace('@', ''));
                    loadAdminData();
                } else {
                    window.showToast(data.error || "Failed to purge files", "error");
                }
            } catch (err) {
                window.showToast("Network error while purging files", "error");
            }
        });
    }

    async function handleDeleteUserSingleFile(fileId, filename) {
        if (!confirm(`Are you sure you want to delete '${filename}'?`)) return;

        try {
            const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
            const data = await res.json();
            if (res.ok && data.success) {
                window.showToast(`Deleted '${filename}'`, "success");
                const userId = manageTargetUserId.value;
                const username = manageUsername.textContent.replace('@', '');
                openUserDataModal(userId, username);
                loadAdminData();
            } else {
                window.showToast(data.error || "Failed to delete file", "error");
            }
        } catch (err) {
            window.showToast("Network error deleting file", "error");
        }
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // Initial Load
    loadAdminData();
});
