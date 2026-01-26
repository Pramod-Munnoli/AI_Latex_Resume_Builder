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
            // Check if already initialized by another script
            if (!window._supabase) {
                await window.initSupabase((event, session) => {
                    currentUser = session?.user || null;
                    window._currentUser = currentUser;
                    updateAuthUI(session);

                    if (event === "PASSWORD_RECOVERY") openAuthModal("update");
                    else if (event === "SIGNED_IN") {
                        closeAuthModal();
                        if (window.location.pathname.includes("ai-builder.html") && window.loadLastSavedResume) {
                            window.loadLastSavedResume();
                        }
                    }
                });
            } else {
                // Attach listener if already initialized? 
                // Currently auth-core only supports one listener in init, 
                // but we can just get the user.
                const { data } = await window._supabase.auth.getUser();
                updateAuthUI({ user: data.user });
            }
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

        $('profileAvatar')?.addEventListener("click", (e) => {
            e.stopPropagation();
            $('profileMenu')?.classList.toggle('active');
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

            // Restore entrance animations for AI Builder
            const triggers = [
                { s: '.ai-builder-hero h1', type: 'style', prop: 'opacity', val: '1' },
                { s: '.ai-builder-hero h1', type: 'style', prop: 'visibility', val: 'visible' },
                { s: '.ai-builder-hero p', type: 'style', prop: 'opacity', val: '1' },
                { s: '.ai-builder-hero p', type: 'style', prop: 'visibility', val: 'visible' },
                { s: '.instruction-step', type: 'class', val: 'is-visible' },
                { s: '.upload-container', type: 'class', val: 'is-visible' }
            ];

            setTimeout(() => {
                const heroH1 = document.querySelector('.ai-builder-hero h1');
                if (heroH1) {
                    heroH1.style.opacity = '1';
                    heroH1.style.visibility = 'visible';
                }
                const heroP = document.querySelector('.ai-builder-hero p');
                if (heroP) {
                    heroP.style.opacity = '1';
                    heroP.style.visibility = 'visible';
                }
                document.querySelectorAll('.instruction-step').forEach(el => el.style.opacity = '1');
                const uploadBox = document.querySelector('.upload-container');
                if (uploadBox) uploadBox.style.opacity = '1';
            }, 100);

            const workspace = document.querySelector('.ai-builder-workspace');
            if (workspace) {
                setTimeout(() => workspace.classList.add('panels-visible'), 200);
            }
        } else if (path.includes("editor.html")) {
            // Editor handles most of its own init for now
            if (window.setupResizer) window.setupResizer();
            if (window.restorePanelSizes) window.restorePanelSizes();

            const container = document.querySelector('.editor-container');
            if (container) {
                setTimeout(() => container.classList.add('panels-visible'), 100);
            }
        }
    }

    // Start App
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

})();
