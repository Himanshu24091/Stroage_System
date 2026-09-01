/**
 * Stealth Cloud Vault - Admin Control Dashboard JavaScript
 */
document.addEventListener("DOMContentLoaded", () => {
    const adminTotalUsers = document.getElementById("adminTotalUsers");
    const adminTotalFiles = document.getElementById("adminTotalFiles");
    const adminTotalStorage = document.getElementById("adminTotalStorage");
    const usersTableBody = document.getElementById("usersTableBody");
    const adminUserSearch = document.getElementById("adminUserSearch");
    const userCountBadge = document.getElementById("userCountBadge");
    const refreshAdminBtn = document.getElementById("refreshAdminBtn");

    // Modal elements
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

    let allUsers = [];

    // 1. Fetch & Render Admin Stats & Users
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
            } else if (usersRes.status === 403) {
                window.location.href = "/";
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
                            <button class="btn-action reset-pass-btn" data-id="${user.id}" data-username="${escapeHtml(user.username)}" title="Reset Password">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </svg>
                                <span>Reset Password</span>
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

        // Attach action listeners
        document.querySelectorAll(".reset-pass-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const userId = btn.dataset.id;
                const username = btn.dataset.username;
                openResetModal(userId, username);
            });
        });

        document.querySelectorAll(".delete-user-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const userId = btn.dataset.id;
                const username = btn.dataset.username;
                handleDeleteUser(userId, username);
            });
        });
    }

    // 2. Search Filter
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

    if (refreshAdminBtn) {
        refreshAdminBtn.addEventListener("click", () => {
            loadAdminData();
            window.showToast("Refreshed user metrics", "info");
        });
    }

    // 3. Reset Password Modal Logic
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

    // Auto-Generate Random Password
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

    // Copy to clipboard
    if (copyPassBtn) {
        copyPassBtn.addEventListener("click", () => {
            const passToCopy = displayCopiedPass.textContent || newPasswordInput.value;
            if (passToCopy) {
                navigator.clipboard.writeText(passToCopy);
                window.showToast("Password copied to clipboard!", "success");
            }
        });
    }

    // Submit Password Reset Form
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
                    window.showToast(`Password for '${data.username}' updated successfully!`, "success");
                    
                    // Copy to clipboard automatically for easy sharing
                    navigator.clipboard.writeText(newPassword);
                    window.showToast("New password copied to clipboard to provide to user!", "info");

                    setTimeout(() => {
                        closeResetModal();
                    }, 2500);
                } else {
                    window.showToast(data.error || "Password reset failed", "error");
                }
            } catch (err) {
                window.showToast("Network error during password reset", "error");
            }
        });
    }

    // Delete User
    async function handleDeleteUser(userId, username) {
        if (!confirm(`Are you sure you want to delete user '${username}'?\nAll their uploaded vault files will be deleted permanently.`)) {
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
