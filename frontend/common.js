/**
 * common.js - Shared utilities for AI LaTeX Resume Builder
 * Extracting global logic to improve performance and modularity.
 */

(function () {
    "use strict";

    // --- GLOBAL UTILITIES ---
    window.$ = function (id) { return document.getElementById(id); };

    // --- THEME MANAGEMENT ---
    const THEME_KEY = "ai_resume_theme";

    window.applyTheme = function () {
        const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.checked = (savedTheme === 'dark');
        }
    };

    window.toggleGlobalTheme = function (isDark) {
        const newTheme = isDark ? 'dark' : 'light';
        localStorage.setItem(THEME_KEY, newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        window.applyTheme();
    };

    // Apply theme immediately on script load
    window.applyTheme();

    // --- AUTH HELPERS ---
    const USER_CACHE_KEY = "ai_resume_user_cache";

    window.getInitials = function (name) {
        if (!name) return "U";
        const parts = name.trim().split(" ");
        if (parts.length === 1) {
            return parts[0].substring(0, 2).toUpperCase();
        }
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    window.saveUserCache = function (user) {
        if (!user) return;
        try {
            const cachePayload = {
                id: user.id,
                email: user.email,
                user_metadata: user.user_metadata || {},
                last_updated: Date.now()
            };
            localStorage.setItem(USER_CACHE_KEY, JSON.stringify(cachePayload));
        } catch (e) {
            console.warn("Cache save failed", e);
        }
    };

    window.loadUserCache = function () {
        try {
            const raw = localStorage.getItem(USER_CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    };

    // --- UI FEEDBACK ---
    window.setStatus = function (text, type) {
        const statusBadge = $('statusBadge');
        if (!statusBadge) return;
        statusBadge.textContent = text;
        statusBadge.className = "status-badge status-" + type;
    };

    let appLoader = null;
    let loaderMessage = null;

    window.initLoader = function () {
        appLoader = $('appLoader');
        loaderMessage = $('appLoaderMessage');
    };

    window.showLoader = function (message = 'Processing, please wait...') {
        if (!appLoader) window.initLoader();
        if (!appLoader) return;
        if (loaderMessage) loaderMessage.textContent = message;
        appLoader.classList.add('active');
        document.body.classList.add('lock-scroll');
        document.body.style.setProperty('overflow', 'hidden', 'important');
        document.body.style.setProperty('overflow-y', 'hidden', 'important');
    };

    window.hideLoader = function () {
        if (!appLoader) return;
        appLoader.classList.remove('active');

        // Only restore scrolling if preview skeleton is also hidden
        const skeletonLoader = $('pdfPreviewLoader');
        const isSkeletonVisible = skeletonLoader && skeletonLoader.style.display === 'flex';

        if (!isSkeletonVisible) {
            document.body.classList.remove('lock-scroll');
            document.body.style.overflow = '';
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('overflow-y');
        }
    };

    // Reinforce on focus
    window.addEventListener('focus', () => {
        const skeletonLoader = $('pdfPreviewLoader');
        const isActive = (skeletonLoader && skeletonLoader.style.display === 'flex') ||
            (appLoader && appLoader.classList.contains('active'));
        if (isActive) {
            document.body.classList.add('lock-scroll');
            document.body.style.setProperty('overflow', 'hidden', 'important');
            document.body.style.setProperty('overflow-y', 'hidden', 'important');
        }
    });

    window.updateLoaderMessage = function (message) {
        if (loaderMessage) loaderMessage.textContent = message;
    };

    window.showToast = function (message, type = "info") {
        // Toast messages removed by user request
        // console.log(`[${type.toUpperCase()}] ${message}`);
    };

    // --- GLOBAL API BASE ---
    window.API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? (window.location.port === "3000" ? "" : "http://localhost:3000")
        : "https://ai-latex-resume-builder.onrender.com";

    // --- WAKE SERVER (NUDGE) ---
    // Start waking up the Render server immediately on page load
    (function wakeServer() {
        if (window.API_BASE) {
            fetch(`${window.API_BASE}/api/health`).catch(() => { /* ignore */ });
        }
    })();

})();
