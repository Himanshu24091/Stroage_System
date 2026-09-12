/**
 * Stealth Cloud Vault - User Authentication JavaScript
 */
document.addEventListener("DOMContentLoaded", () => {
    const tabLoginBtn = document.getElementById("tabLoginBtn");
    const tabRegisterBtn = document.getElementById("tabRegisterBtn");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");

    // Login Form Elements
    const loginIdentifier = document.getElementById("loginIdentifier");
    const loginPassword = document.getElementById("loginPassword");
    const loginErrorMessage = document.getElementById("loginErrorMessage");
    const loginErrorText = document.getElementById("loginErrorText");
    const loginSubmitBtn = document.getElementById("loginSubmitBtn");

    // Register Form Elements
    const regUsername = document.getElementById("regUsername");
    const regEmail = document.getElementById("regEmail");
    const regPassword = document.getElementById("regPassword");
    const regErrorMessage = document.getElementById("regErrorMessage");
    const regErrorText = document.getElementById("regErrorText");
    const registerSubmitBtn = document.getElementById("registerSubmitBtn");

    // Global Logout button
    const logoutBtn = document.getElementById("logoutBtn");

    // 1. Tab Switching
    if (tabLoginBtn && tabRegisterBtn) {
        tabLoginBtn.addEventListener("click", () => {
            tabLoginBtn.classList.add("active");
            tabRegisterBtn.classList.remove("active");
            loginForm.classList.remove("hidden");
            registerForm.classList.add("hidden");
            if (loginIdentifier) loginIdentifier.focus();
        });

        tabRegisterBtn.addEventListener("click", () => {
            tabRegisterBtn.classList.add("active");
            tabLoginBtn.classList.remove("active");
            registerForm.classList.remove("hidden");
            loginForm.classList.add("hidden");
            if (regUsername) regUsername.focus();
        });
    }

    // 2. Password Visibility Toggles
    document.querySelectorAll(".password-toggle-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (input) {
                if (input.type === "password") {
                    input.type = "text";
                    btn.style.color = "var(--cyan-primary)";
                } else {
                    input.type = "password";
                    btn.style.color = "var(--text-dim)";
                }
            }
        });
    });

    // 3. Login Submission
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const identifier = loginIdentifier.value.trim();
            const password = loginPassword.value.trim();

            if (!identifier || !password) return;

            loginSubmitBtn.disabled = true;
            loginSubmitBtn.innerHTML = `<span>Signing in...</span>`;
            loginErrorMessage.classList.add("hidden");

            try {
                const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ identifier, password })
                });

                const data = await res.json();

                if (res.ok && data.success) {
                    if (typeof window.setVaultTabSessionActive === "function") {
                        window.setVaultTabSessionActive();
                    } else {
                        sessionStorage.setItem("vault_tab_active", "true");
                    }
                    window.location.replace("/");
                } else {
                    loginErrorText.textContent = data.error || "Invalid username/email or password";
                    loginErrorMessage.classList.remove("hidden");
                    loginSubmitBtn.disabled = false;
                    loginSubmitBtn.innerHTML = `<span>Sign In to Vault</span>`;
                }
            } catch (err) {
                loginErrorText.textContent = "Network connection error. Try again.";
                loginErrorMessage.classList.remove("hidden");
                loginSubmitBtn.disabled = false;
                loginSubmitBtn.innerHTML = `<span>Sign In to Vault</span>`;
            }
        });
    }

    // Real-Time Registration Username Availability Checker
    let usernameCheckTimeout = null;
    let isUsernameAvailable = false;

    if (regUsername) {
        const feedbackBox = document.getElementById("regUsernameFeedback");
        const feedbackIcon = document.getElementById("regUsernameFeedbackIcon");
        const feedbackText = document.getElementById("regUsernameFeedbackText");

        regUsername.addEventListener("input", () => {
            const rawVal = regUsername.value.trim();
            clearTimeout(usernameCheckTimeout);

            if (!rawVal) {
                if (feedbackBox) feedbackBox.classList.add("hidden");
                regUsername.style.borderColor = "";
                isUsernameAvailable = false;
                return;
            }

            if (rawVal.length < 3) {
                if (feedbackBox) {
                    feedbackBox.classList.remove("hidden");
                    feedbackBox.style.color = "#f59e0b"; // Amber warning
                    feedbackIcon.innerHTML = "⏳";
                    feedbackText.textContent = "Username must be at least 3 characters";
                }
                regUsername.style.borderColor = "#f59e0b";
                isUsernameAvailable = false;
                return;
            }

            // Debounced availability check
            if (feedbackBox) {
                feedbackBox.classList.remove("hidden");
                feedbackBox.style.color = "#94a3b8";
                feedbackIcon.innerHTML = `<span class="spinner-inline" style="width: 12px; height: 12px; display: inline-block;"></span>`;
                feedbackText.textContent = "Checking availability...";
            }

            usernameCheckTimeout = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(rawVal)}`);
                    const data = await res.json();

                    if (!feedbackBox) return;

                    if (data.available) {
                        feedbackBox.style.color = "#10b981"; // Vibrant Emerald
                        feedbackIcon.innerHTML = "✓";
                        feedbackText.textContent = data.message || `'${rawVal}' is available!`;
                        regUsername.style.borderColor = "#10b981";
                        isUsernameAvailable = true;
                    } else {
                        feedbackBox.style.color = "#f43f5e"; // Vibrant Rose/Red
                        feedbackIcon.innerHTML = "✕";
                        feedbackText.textContent = data.message || `'${rawVal}' is already taken`;
                        regUsername.style.borderColor = "#f43f5e";
                        isUsernameAvailable = false;
                    }
                } catch (e) {
                    isUsernameAvailable = true;
                }
            }, 280);
        });
    }

    // 4. Register Submission
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const username = regUsername.value.trim();
            const email = regEmail.value.trim();
            const password = regPassword.value.trim();

            if (!username || !email || !password) return;

            if (!isUsernameAvailable) {
                regErrorText.textContent = "Username is already taken or invalid. Please pick an available username.";
                regErrorMessage.classList.remove("hidden");
                regUsername.focus();
                return;
            }

            registerSubmitBtn.disabled = true;
            registerSubmitBtn.innerHTML = `<span>Creating vault...</span>`;
            regErrorMessage.classList.add("hidden");

            try {
                const res = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, email, password })
                });

                const data = await res.json();

                if (res.ok && data.success) {
                    if (typeof window.setVaultTabSessionActive === "function") {
                        window.setVaultTabSessionActive();
                    } else {
                        sessionStorage.setItem("vault_tab_active", "true");
                    }
                    window.location.replace("/");
                } else {
                    regErrorText.textContent = data.error || "Registration failed. Try again.";
                    regErrorMessage.classList.remove("hidden");
                    registerSubmitBtn.disabled = false;
                    registerSubmitBtn.innerHTML = `<span>Create My Private Vault</span>`;
                }
            } catch (err) {
                regErrorText.textContent = "Network connection error. Try again.";
                regErrorMessage.classList.remove("hidden");
                registerSubmitBtn.disabled = false;
                registerSubmitBtn.innerHTML = `<span>Create My Private Vault</span>`;
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            if (typeof window.terminateVaultSession === "function") {
                await window.terminateVaultSession();
            } else {
                sessionStorage.removeItem("vault_tab_active");
                try {
                    await fetch("/api/auth/logout", { method: "POST" });
                } catch (err) {}
                window.location.replace("/login?reason=logged_out");
            }
        });
    }
});
