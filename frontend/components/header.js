
const headerHTML = `
    <!-- Navigation Bar -->
    <nav class="navbar">
        <div class="nav-container">
            <!-- Mobile Auth Slot (Left Side) - Only visible on Mobile -->
            <div id="mobileAuthTrigger" class="mobile-auth-trigger"></div>

            <div id="dynamicLogoArea" class="nav-logo-dynamic">
                <a href="index.html" class="nav-logo">
                    <img src="images/logo-premium.svg" alt="AI LaTeX Resume Builder Logo" class="logo-image" width="32" height="32">
                    <span class="logo-text">AI LaTeX Resume Builder</span>
                </a>
            </div>
            <div class="nav-links">
                <a href="index.html" class="nav-link" data-text="Home"><span>Home</span></a>
                <a href="ai-builder.html" class="nav-link nav-link-featured" data-text="AI Builder"><span>AI Builder</span></a>
                <a href="templates.html" class="nav-link nav-link-templates" data-text="Templates"><span>Templates</span></a>
                <a href="editor.html" class="nav-link" data-text="Editor"><span>Editor</span></a>
                <a href="docs.html" class="nav-link" data-text="Docs"><span>Docs</span></a>
            </div>
            
            <!-- Desktop Auth (Right Side) -->
            <div id="authContainer" class="auth-container">
                <a href="login.html" id="authBtn" class="btn-auth">Login</a>
                <!-- Modern Profile Dropdown -->
                <div id="profileDropdown" class="profile-dropdown" style="display: none;">
                    <div id="profileAvatar" class="profile-avatar">PM</div>
                    <div id="profileMenu" class="profile-menu">
                        <div class="profile-menu-header">
                            <span id="profileName" class="profile-menu-name">User Name</span>
                            <span id="profileEmail" class="profile-menu-email">user@example.com</span>
                        </div>
                        <div class="profile-menu-items">
                            <a href="#" class="profile-menu-item" disabled>
                                <span>📊</span>
                                <span>Dashboard</span>
                            </a>
                            <a href="#" class="profile-menu-item" disabled>
                                <span>📄</span>
                                <span>My Resumes</span>
                            </a>
                            <div class="profile-menu-divider"></div>
                            <button id="logoutBtn" class="profile-menu-item logout">
                                <span>🚪</span>
                                <span>Logout</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Mobile Menu Button -->
            <button id="mobileMenuBtn" class="mobile-menu-btn" aria-label="Toggle Menu">
                <span class="hamburger-icon">☰</span>
            </button>
        </div>
    </nav>

    <!-- Mobile Navigation Overlay -->
    <div id="mobileNavOverlay" class="mobile-nav-overlay">
        <div class="mobile-nav-links">
            <a href="index.html" class="mobile-nav-link">Home</a>
            <a href="ai-builder.html" class="mobile-nav-link mobile-nav-link-featured">AI Builder</a>
            <a href="templates.html" class="mobile-nav-link mobile-nav-link-templates">Templates</a>
            <a href="editor.html" class="mobile-nav-link">Editor</a>
            <a href="docs.html" class="mobile-nav-link">Docs</a>
        </div>

        <div class="mobile-auth-container">
            <a href="login.html" class="btn btn-primary" style="justify-content: center;">Login / Sign Up</a>
        </div>
    </div>
`;

// Inject Header
const headerPlaceholder = document.getElementById('app-header');
if (headerPlaceholder) {
    headerPlaceholder.innerHTML = headerHTML;
}

// Logic to highlight active link
(function () {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');

    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath) {
            link.classList.add('active');
        } else {
            // Special case for 'index.html' matching root
            if (currentPath === '' && href === 'index.html') {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        }
    });


    // Mobile Menu Toggle Logic
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileNavOverlay = document.getElementById('mobileNavOverlay');

    if (mobileMenuBtn && mobileNavOverlay) {
        mobileMenuBtn.addEventListener('click', () => {
            const isActive = mobileMenuBtn.classList.toggle('active');
            mobileNavOverlay.classList.toggle('active');

            // Handle Icon Toggle (☰ ↔ ✕)
            const icon = mobileMenuBtn.querySelector('.hamburger-icon');
            if (icon) {
                icon.textContent = isActive ? '✕' : '☰';
            }

            // Lock/Unlock Body Scroll
            if (isActive) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        });

        // Close menu when clicking on a link
        const mobileLinks = mobileNavOverlay.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenuBtn.classList.remove('active');
                mobileNavOverlay.classList.remove('active');
                document.body.style.overflow = '';
                const icon = mobileMenuBtn.querySelector('.hamburger-icon');
                if (icon) icon.textContent = '☰';
            });
        });
    }

    // --- OPTIMISTIC AUTH UI LOAD ---
    // This runs IMMEDIATELY after header injection to prevent flicker/delay
    try {
        const USER_CACHE_KEY_HEADER = "ai_resume_user_cache";
        const rawCache = localStorage.getItem(USER_CACHE_KEY_HEADER);
        const authBtn = document.getElementById('authBtn');
        const profileDropdown = document.getElementById('profileDropdown');

        if (rawCache) {
            const cachedUser = JSON.parse(rawCache);
            if (cachedUser) {
                // Get elements we just injected
                const profileAvatar = document.getElementById('profileAvatar');
                const profileName = document.getElementById('profileName');
                const profileEmail = document.getElementById('profileEmail');
                const mobileAuthTrigger = document.getElementById('mobileAuthTrigger');

                // 1. Hide Login Button
                if (authBtn) authBtn.style.setProperty('display', 'none', 'important');

                // 2. Show Profile Dropdown
                if (profileDropdown) profileDropdown.style.display = 'block';

                // 3. Populate Data
                let displayName = cachedUser.user_metadata?.username ||
                    cachedUser.user_metadata?.full_name ||
                    cachedUser.email ||
                    "User";

                // Capitalization logic
                if (displayName && !displayName.includes("@")) {
                    displayName = displayName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                }

                // Initials logic
                let initials = "U";
                if (displayName) {
                    const parts = displayName.trim().split(" ");
                    if (parts.length === 1) {
                        initials = parts[0].substring(0, 2).toUpperCase();
                    } else {
                        initials = (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
                    }
                }

                if (profileAvatar) profileAvatar.textContent = initials;
                if (profileName) profileName.textContent = displayName;
                if (profileEmail) profileEmail.textContent = cachedUser.email || "";

                // 4. Handle Mobile Auth Trigger
                if (mobileAuthTrigger) {
                    mobileAuthTrigger.innerHTML = `
                        <div class="profile-avatar" id="headerProfileAvatar">${initials}</div>
                    `;
                }
            }
        } else {
            // Logged out or no cache: Show login button immediately
            if (authBtn) authBtn.style.setProperty('display', 'flex', 'important');
            if (profileDropdown) profileDropdown.style.display = 'none';

            const mobileAuthTrigger = document.getElementById('mobileAuthTrigger');
            if (mobileAuthTrigger) {
                mobileAuthTrigger.innerHTML = `<a href="login.html" class="btn-tiny-auth">Login</a>`;
            }
        }
    } catch (e) {
        console.warn("Header optimistic load failed:", e);
    }
})();
