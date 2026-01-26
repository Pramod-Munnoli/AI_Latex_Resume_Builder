/**
 * script.js - Lightweight Global UI & Logic Controller
 * Dependencies: common.js, auth-core.js
 */

(function () {
    "use strict";

    let currentUser = null;
    let authMode = "login";

    // --- INITIALIZATION ---
    async function init() {
        window.initLoader();

        // Load cached user for fast UI feedback
        const cachedUser = window.loadUserCache();
        if (cachedUser) updateAuthUI({ user: cachedUser });

        try {
            await window.initSupabase((event, session) => {
                currentUser = session?.user || null;
                window._currentUser = currentUser; // Set global ref for other modules
                updateAuthUI(session);

                // Handle specific auth events
                if (event === "PASSWORD_RECOVERY") openAuthModal("update");
                else if (event === "SIGNED_IN") {
                    closeAuthModal();
                    if (window.location.pathname.includes("ai-builder.html") && window.loadLastSavedResume) {
                        window.loadLastSavedResume();
                    }
                }
            });
        } catch (err) {
            console.error("Supabase fail", err);
        }

        setupGlobalListeners();
        handlePageSpecificInit();
    }

    // --- UI UPDATES ---
    function updateAuthUI(session) {
        const user = session?.user || currentUser;
        currentUser = user;

        const profileDropdown = $('profileDropdown');
        const authBtn = $('authBtn');
        const mobileAuthTrigger = $('mobileAuthTrigger');

        if (user) {
            window.saveUserCache(user);
            if (authBtn) authBtn.style.display = 'none';
            if (profileDropdown) profileDropdown.style.display = "block";

            const initials = window.getInitials(user.user_metadata?.username || user.email);
            const avatar = $('profileAvatar');
            if (avatar) avatar.textContent = initials;

            if (mobileAuthTrigger) {
                mobileAuthTrigger.innerHTML = `<div class="profile-avatar" id="headerProfileAvatar">${initials}</div>`;
                $('headerProfileAvatar').onclick = (e) => {
                    e.stopPropagation();
                    $('profileMenu')?.classList.toggle('active');
                };
            }
        } else {
            localStorage.removeItem("ai_resume_user_cache");
            if (authBtn) authBtn.style.display = '';
            if (profileDropdown) profileDropdown.style.display = "none";
        }
    }

    // --- MODAL LOGIC ---
    function openAuthModal(mode = "login") {
        authMode = mode;
        const modal = $('authModal');
        if (modal) modal.style.display = "block";
        // Logic to toggle fields based on mode...
    }

    function closeAuthModal() {
        const modal = $('authModal');
        if (modal) modal.style.display = "none";
    }

    // --- EVENT LISTENERS ---
    function setupGlobalListeners() {
        document.addEventListener("click", (e) => {
            const dropdown = $('profileDropdown');
            if (dropdown && !dropdown.contains(e.target)) {
                $('profileMenu')?.classList.remove("active");
            }
        });

        $('logoutBtn')?.addEventListener("click", async () => {
            window.showLoader("Logging out...");
            await window.performLogout();
            window.location.reload();
        });

        $('authBtn')?.addEventListener("click", (e) => {
            if ($('authBtn').tagName !== "A") {
                e.preventDefault();
                openAuthModal();
            }
        });
    }

    function handlePageSpecificInit() {
        const path = window.location.pathname;
        if (path.includes("ai-builder.html")) {
            if (window.initCodeMirror) window.initCodeMirror();
            if (window.setupToolbarFeatures) window.setupToolbarFeatures();
            if (window.setupResizer) window.setupResizer();
            if (window.restorePanelSizes) window.restorePanelSizes();

            // Re-bind actions
            $('uploadBtn')?.addEventListener("click", window.uploadPdf);
            $('recompileBtn')?.addEventListener("click", window.recompileLatex);
            $('downloadBtn')?.addEventListener("click", () => {
                window.open(`${API_BASE}/api/download`, "_blank");
            });

            // If logged in, load resume
            if (currentUser && window.loadLastSavedResume) {
                window.loadLastSavedResume();
            }
        } else if (path.includes("editor.html")) {
            // Editor handles most of its own init for now
            if (window.setupResizer) window.setupResizer();
            if (window.restorePanelSizes) window.restorePanelSizes();
        }
    }

    // Start App
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

})();
