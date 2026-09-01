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
                    window.location.href = "/";
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

    // 4. Register Submission
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const username = regUsername.value.trim();
            const email = regEmail.value.trim();
            const password = regPassword.value.trim();

            if (!username || !email || !password) return;

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
                    window.location.href = "/";
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

    // 5. Logout Action
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
