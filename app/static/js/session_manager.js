/**
 * Stealth Cloud Vault - Tab-Scoped Session & Back-Button Protection Manager
 * 
 * Features:
 * 1. Auto session out when browser tab is closed (Affects website only, Google Account is 100% untouched).
 * 2. Distinguishes page refreshes (F5) so active user does NOT get logged out on reload.
 * 3. Multi-tab coordination via BroadcastChannel and localStorage heartbeats.
 * 4. Back-button (bfcache) navigation protection: pressing Back (<-) after logout will NOT reach dashboard.
 */

(function () {
    "use strict";

    const TAB_STORAGE_KEY = "vault_tab_active";
    const RELOAD_FLAG_KEY = "vault_is_reloading";
    const REGISTRY_KEY = "vault_active_tab_registry";
    const CHANNEL_NAME = "vault_tab_channel";

    // Generate unique tab identifier
    const TAB_ID = "tab_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
    window.__VAULT_TAB_ID = TAB_ID;

    // Check if current page is protected (Dashboard or Admin)
    const isProtectedPage = function () {
        const path = window.location.pathname;
        return path === "/" || path === "/admin";
    };

    const isAuthPage = function () {
        const path = window.location.pathname;
        return path === "/login" || path === "/admin/login";
    };

    // BroadcastChannel support with graceful fallback
    let broadcastChannel = null;
    try {
        if (typeof BroadcastChannel !== "undefined") {
            broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
        }
    } catch (e) {
        broadcastChannel = null;
    }

    // Registry helpers in localStorage
    const getRegistry = function () {
        try {
            const raw = localStorage.getItem(REGISTRY_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    };

    const saveRegistry = function (registry) {
        try {
            localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
        } catch (e) {}
    };

    const registerTab = function () {
        const reg = getRegistry();
        reg[TAB_ID] = Date.now();
        saveRegistry(reg);
    };

    const unregisterTab = function () {
        const reg = getRegistry();
        delete reg[TAB_ID];
        // Prune stale tabs older than 8 seconds
        const now = Date.now();
        for (const id in reg) {
            if (now - reg[id] > 8000) {
                delete reg[id];
            }
        }
        saveRegistry(reg);
        return Object.keys(reg).length;
    };

    // Periodic heartbeat to keep this tab alive in registry
    setInterval(() => {
        if (sessionStorage.getItem(TAB_STORAGE_KEY) === "true") {
            registerTab();
        }
    }, 3000);

    // Listen to inter-tab communication
    if (broadcastChannel) {
        broadcastChannel.onmessage = function (event) {
            const data = event.data || {};
            if (data.type === "CHECK_ACTIVE_TAB" && data.sender !== TAB_ID) {
                // If this tab is active, reply to the new tab so it knows a session is active
                if (sessionStorage.getItem(TAB_STORAGE_KEY) === "true") {
                    try {
                        broadcastChannel.postMessage({
                            type: "ACTIVE_TAB_CONFIRMED",
                            responder: TAB_ID
                        });
                    } catch (e) {}
                }
            } else if (data.type === "FORCE_LOGOUT") {
                // Another tab clicked manual logout -> logout all tabs immediately
                sessionStorage.removeItem(TAB_STORAGE_KEY);
                if (isProtectedPage()) {
                    window.location.replace("/login?reason=logged_out");
                }
            }
        };
    }

    // -------------------------------------------------------------
    // 1. Initial Page Load Check (Protected Pages)
    // -------------------------------------------------------------
    if (isProtectedPage()) {
        const hasTabSession = sessionStorage.getItem(TAB_STORAGE_KEY) === "true";

        if (hasTabSession) {
            // Tab is already marked active (e.g. navigation within site or page refresh)
            registerTab();
        } else {
            // No tab marker found in this tab! Could another tab be open?
            // Ask existing tabs via BroadcastChannel
            let answered = false;

            if (broadcastChannel) {
                const messageHandler = function (event) {
                    const data = event.data || {};
                    if (data.type === "ACTIVE_TAB_CONFIRMED") {
                        answered = true;
                        sessionStorage.setItem(TAB_STORAGE_KEY, "true");
                        registerTab();
                        broadcastChannel.removeEventListener("message", messageHandler);
                    }
                };

                broadcastChannel.addEventListener("message", messageHandler);

                try {
                    broadcastChannel.postMessage({
                        type: "CHECK_ACTIVE_TAB",
                        sender: TAB_ID
                    });
                } catch (e) {}

                // Give other tabs 120ms to respond
                setTimeout(() => {
                    broadcastChannel.removeEventListener("message", messageHandler);
                    if (!answered) {
                        // No other tab is open! Previous tab was closed!
                        // Invalidate session on server and redirect to login
                        executeAutoLogout("tab_closed");
                    }
                }, 120);
            } else {
                // Fallback if BroadcastChannel not supported
                const reg = getRegistry();
                const now = Date.now();
                let hasLiveOtherTab = false;
                for (const id in reg) {
                    if (id !== TAB_ID && now - reg[id] < 5000) {
                        hasLiveOtherTab = true;
                        break;
                    }
                }
                if (hasLiveOtherTab) {
                    sessionStorage.setItem(TAB_STORAGE_KEY, "true");
                    registerTab();
                } else {
                    executeAutoLogout("tab_closed");
                }
            }
        }
    }

    // Auto logout handler
    function executeAutoLogout(reason) {
        sessionStorage.removeItem(TAB_STORAGE_KEY);
        unregisterTab();
        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon("/api/auth/logout");
            } else {
                fetch("/api/auth/logout", { method: "POST", keepalive: true });
            }
        } catch (e) {}
        window.location.replace("/login?reason=" + encodeURIComponent(reason || "tab_closed"));
    }

    // -------------------------------------------------------------
    // 2. Tab Close vs Page Refresh (F5) Detection
    // -------------------------------------------------------------
    window.addEventListener("beforeunload", function () {
        // Set flag that page is reloading or navigating within site
        try {
            sessionStorage.setItem(RELOAD_FLAG_KEY, "true");
        } catch (e) {}
    });

    // Clear reload flag once page finishes loading
    document.addEventListener("DOMContentLoaded", function () {
        try {
            sessionStorage.removeItem(RELOAD_FLAG_KEY);
        } catch (e) {}
    });

    window.addEventListener("pagehide", function (event) {
        // pagehide fires when tab is closed OR reloaded
        const isReloading = sessionStorage.getItem(RELOAD_FLAG_KEY) === "true";

        if (!isReloading) {
            // The user CLOSED the tab!
            const remainingTabs = unregisterTab();
            // If this was the last active tab of the website, notify backend
            if (remainingTabs <= 0) {
                try {
                    if (navigator.sendBeacon) {
                        navigator.sendBeacon("/api/auth/logout");
                    }
                } catch (e) {}
            }
        }
    });

    // -------------------------------------------------------------
    // 3. Browser Back-Button (Bfcache) Protection
    // -------------------------------------------------------------
    window.addEventListener("pageshow", function (event) {
        // event.persisted is true when browser restores page from Back-Forward cache
        const navEntries = (window.performance && window.performance.getEntriesByType)
            ? window.performance.getEntriesByType("navigation")
            : [];
        const isBackForward = event.persisted || (navEntries.length > 0 && navEntries[0].type === "back_forward");

        if (isBackForward) {
            if (isProtectedPage()) {
                const hasTabSession = sessionStorage.getItem(TAB_STORAGE_KEY) === "true";
                if (!hasTabSession) {
                    // User was logged out and clicked Back -> Block immediately
                    window.location.replace("/login?reason=logged_out");
                } else {
                    // Force a reload from server so HTTP Cache-Control re-validates auth
                    window.location.reload();
                }
            } else if (isAuthPage()) {
                // If on login page and pressed back, ensure tab marker is cleared
                sessionStorage.removeItem(TAB_STORAGE_KEY);
            }
        }
    });

    // -------------------------------------------------------------
    // 4. Global API for Login / Manual Logout
    // -------------------------------------------------------------
    window.setVaultTabSessionActive = function () {
        sessionStorage.setItem(TAB_STORAGE_KEY, "true");
        registerTab();
    };

    window.terminateVaultSession = async function () {
        sessionStorage.removeItem(TAB_STORAGE_KEY);
        unregisterTab();

        if (broadcastChannel) {
            try {
                broadcastChannel.postMessage({ type: "FORCE_LOGOUT", sender: TAB_ID });
            } catch (e) {}
        }

        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch (e) {}

        // Use replace so login page overwrites history and Back button cannot revisit dashboard
        window.location.replace("/login?reason=logged_out");
    };

    // Expose global alias for existing logout calls
    window.handleLogout = window.terminateVaultSession;
})();
