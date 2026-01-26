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
        document.body.style.overflow = 'hidden';
    };

    window.hideLoader = function () {
        if (!appLoader) return;
        appLoader.classList.remove('active');
        document.body.style.overflow = '';
    };

    window.updateLoaderMessage = function (message) {
        if (loaderMessage) loaderMessage.textContent = message;
    };

    window.showToast = function (title, message, type = "info") {
        // Shared interface for future toast implementation
        console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    };

    // --- GLOBAL API BASE ---
    window.API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? (window.location.port === "3000" ? "" : "http://localhost:3000")
        : "https://ai-latex-resume-builder.onrender.com";

})();
