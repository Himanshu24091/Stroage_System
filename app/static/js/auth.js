/**
 * ==============================================================================
 * STEALTH CLOUD VAULT - AUTH & PIN CONTROLLER
 * ==============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const pinInput = document.getElementById("pinInput");
    const togglePinVis = document.getElementById("togglePinVis");
    const authCard = document.querySelector(".auth-card");
    const authErrorMessage = document.getElementById("authErrorMessage");
    const errorText = document.getElementById("errorText");
    const unlockBtn = document.getElementById("unlockBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    // Toggle PIN visibility
    if (togglePinVis && pinInput) {
        togglePinVis.addEventListener("click", () => {
            if (pinInput.type === "password") {
                pinInput.type = "text";
                togglePinVis.style.color = "var(--cyan-primary)";
            } else {
                pinInput.type = "password";
                togglePinVis.style.color = "var(--text-dim)";
            }
        });
    }

    // Login Form Submit
    if (loginForm && pinInput) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const pin = pinInput.value.trim();

            if (!pin) return;

            // UI Loading state
            if (unlockBtn) {
                unlockBtn.disabled = true;
                unlockBtn.innerHTML = `
                    <div class="spinner-ring" style="width: 16px; height: 16px; border-width: 2px;"></div>
                    <span>Verifying...</span>
                `;
            }

            try {
                const res = await fetch("/api/auth/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pin })
                });

                const data = await res.json();

                if (res.ok && data.success) {
                    // Redirect to dashboard or next param
                    const urlParams = new URLSearchParams(window.location.search);
                    const nextUrl = urlParams.get("next") || "/";
                    window.location.href = nextUrl;
                } else {
                    // Trigger error & shake
                    if (authErrorMessage && errorText) {
                        errorText.textContent = data.error || "Incorrect PIN. Access denied.";
                        authErrorMessage.classList.remove("hidden");
                    }
                    if (authCard) {
                        authCard.classList.add("shake");
                        setTimeout(() => authCard.classList.remove("shake"), 500);
                    }
                    pinInput.value = "";
                    pinInput.focus();
                }
            } catch (err) {
                if (authErrorMessage && errorText) {
                    errorText.textContent = "Server connection error.";
                    authErrorMessage.classList.remove("hidden");
                }
            } finally {
                if (unlockBtn) {
                    unlockBtn.disabled = false;
                    unlockBtn.innerHTML = `
                        <span>Unlock Vault</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"/>
                            <polyline points="12 5 19 12 12 19"/>
                        </svg>
                    `;
                }
            }
        });
    }

    // Logout Handler
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
            } catch (err) {
                window.location.href = "/login";
            }
        });
    }
});
