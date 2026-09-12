/**
 * Stealth Cloud Vault - Tab-Scoped Session & Back-Button Protection Manager
 * 
 * Features:
 * 1. Auto session out when browser tab is closed (Affects website only, Google Account is 100% untouched).
 * 2. Instant tab authentication check (0ms delay, anti-FOAC screen shield).
 * 3. Multi-tab coordination via BroadcastChannel and localStorage heartbeats.
 * 4. Back-button (bfcache) navigation protection: pressing Back (<-) after logout will NEVER reach dashboard.
 */

(function () {
    "use strict";

    const TAB_STORAGE_KEY = "vault_tab_active";
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
        // Prune stale tabs older than 5 seconds
        const now = Date.now();
        let remainingCount = 0;
        for (const id in reg) {
            if (now - reg[id] > 5000) {
                delete reg[id];
            } else {
                remainingCount++;
            }
        }
        saveRegistry(reg);
        return remainingCount;
    };

    // Periodic heartbeat to keep this tab alive in registry
    setInterval(() => {
        if (sessionStorage.getItem(TAB_STORAGE_KEY) === "true") {
            registerTab();
        }
    }, 2000);

    // Listen to inter-tab communication
    if (broadcastChannel) {
        broadcastChannel.onmessage = function (event) {
            const data = event.data || {};
            if (data.type === "CHECK_ACTIVE_TAB" && data.sender !== TAB_ID) {
                // If this tab is active, reply immediately so the new tab knows a session is alive
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
                document.cookie = "vault_tab_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
                if (isProtectedPage()) {
                    const target = window.location.pathname.startsWith("/admin") ? "/admin/login?reason=logged_out" : "/login?reason=logged_out";
                    window.location.replace(target);
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
            // Tab is already marked active (e.g. navigation within site or page reload)
            registerTab();
            // Restore visibility in case shield was set
            document.documentElement.style.visibility = "";
        } else {
            // Check if this was an in-tab reload
            const isReload = (function() {
                try {
                    const nav = window.performance && window.performance.getEntriesByType && window.performance.getEntriesByType("navigation");
                    if (nav && nav.length > 0 && nav[0].type === "reload") return true;
                    if (window.performance && window.performance.navigation && window.performance.navigation.type === 1) return true;
                } catch(e) {}
                return false;
            })();

            if (isReload) {
                sessionStorage.setItem(TAB_STORAGE_KEY, "true");
                registerTab();
                document.documentElement.style.visibility = "";
            } else {
                // Brand new tab: ask existing tabs via BroadcastChannel with ultra-fast 30ms window
                let answered = false;

                if (broadcastChannel) {
                    const messageHandler = function (event) {
                        const data = event.data || {};
                        if (data.type === "ACTIVE_TAB_CONFIRMED") {
                            answered = true;
                            sessionStorage.setItem(TAB_STORAGE_KEY, "true");
                            registerTab();
                            document.documentElement.style.visibility = "";
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

                    setTimeout(() => {
                        broadcastChannel.removeEventListener("message", messageHandler);
                        if (!answered) {
                            // No other tab confirmed -> Previous tab was closed!
                            executeAutoLogout("tab_closed");
                        }
                    }, 30);
                } else {
                    // Fallback if BroadcastChannel not supported
                    const reg = getRegistry();
                    const now = Date.now();
                    let hasLiveOtherTab = false;
                    for (const id in reg) {
                        if (id !== TAB_ID && now - reg[id] < 3500) {
                            hasLiveOtherTab = true;
                            break;
                        }
                    }
                    if (hasLiveOtherTab) {
                        sessionStorage.setItem(TAB_STORAGE_KEY, "true");
                        registerTab();
                        document.documentElement.style.visibility = "";
                    } else {
                        executeAutoLogout("tab_closed");
                    }
                }
            }
        }
    }

    // Auto logout handler
    function executeAutoLogout(reason) {
        sessionStorage.removeItem(TAB_STORAGE_KEY);
        unregisterTab();
        try {
            document.cookie = "vault_tab_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
            if (navigator.sendBeacon) {
                navigator.sendBeacon("/api/auth/logout");
            } else {
                fetch("/api/auth/logout", { method: "POST", keepalive: true });
            }
        } catch (e) {}
        const target = window.location.pathname.startsWith("/admin") ? "/admin/login?reason=" : "/login?reason=";
        window.location.replace(target + encodeURIComponent(reason || "tab_closed"));
    }

    // -------------------------------------------------------------
    // 2. Tab Close Detection (pagehide)
    // -------------------------------------------------------------
    window.addEventListener("pagehide", function () {
        // Unregister tab from localStorage registry
        const remainingTabs = unregisterTab();

        // If this was the last active tab of the website, notify backend
        if (remainingTabs <= 0) {
            try {
                if (navigator.sendBeacon) {
                    navigator.sendBeacon("/api/auth/logout");
                }
            } catch (e) {}
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
                    document.documentElement.style.visibility = "hidden";
                    const target = window.location.pathname.startsWith("/admin") ? "/admin/login?reason=logged_out" : "/login?reason=logged_out";
                    window.location.replace(target);
                } else {
                    // Force a reload from server so HTTP Cache-Control re-validates auth
                    window.location.reload();
                }
            } else if (isAuthPage()) {
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
        document.documentElement.style.visibility = "";
    };

    window.terminateVaultSession = async function () {
        sessionStorage.removeItem(TAB_STORAGE_KEY);
        unregisterTab();

        try {
            document.cookie = "vault_tab_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
        } catch (e) {}

        if (broadcastChannel) {
            try {
                broadcastChannel.postMessage({ type: "FORCE_LOGOUT", sender: TAB_ID });
            } catch (e) {}
        }

        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch (e) {}

        const target = window.location.pathname.startsWith("/admin") ? "/admin/login?reason=logged_out" : "/login?reason=logged_out";
        window.location.replace(target);
    };

    // Expose global alias for existing logout calls
    window.handleLogout = window.terminateVaultSession;
})();
