
const headerHTML = `
    <!-- Navigation Bar -->
    <nav class="navbar">
        <div class="nav-container">
            <!-- Mobile Auth Slot (Left Side) - Only visible on Mobile -->
            <div id="mobileAuthTrigger" class="mobile-auth-trigger"></div>

            <div id="dynamicLogoArea" class="nav-logo-dynamic">
                <a href="index.html" class="nav-logo">
                    <span class="logo-icon">📄</span>
                    <span class="logo-text">AI LaTeX Resume Builder</span>
                </a>
            </div>
            <div class="nav-links">
                <a href="index.html" class="nav-link" data-text="Home">Home</a>
                <a href="templates.html" class="nav-link" data-text="Templates">Templates</a>
                <a href="ai-builder.html" class="nav-link" data-text="AI Builder">AI Builder</a>
                <a href="editor.html" class="nav-link" data-text="Editor">Editor</a>
                <a href="docs.html" class="nav-link" data-text="Docs">Docs</a>
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
            <a href="templates.html" class="mobile-nav-link">Templates</a>
            <a href="ai-builder.html" class="mobile-nav-link">AI Builder</a>
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
            mobileMenuBtn.classList.toggle('active');
            mobileNavOverlay.classList.toggle('active');

            // Toggle hamburger icon
            const icon = mobileMenuBtn.querySelector('.hamburger-icon');
            if (icon) {
                icon.textContent = mobileMenuBtn.classList.contains('active') ? '✕' : '☰';
            }
        });
    }

    // Auth Container Responsive Handling (for "Left Side Profile on Mobile")
    // Note: The actual auth state logic is in script.js, which updates #authBtn/profileDropdown.
    // We need to ensure that on mobile, the profile/login is visible on the LEFT.

    // We will clone the auth content to the mobile-auth-trigger on the left for mobile view
    // or handle it via CSS. 
    // To strictly follow "login button... on the left", we might need to duplicate the auth button 
    // into the left container if we are on mobile.

    // However, since script.js manages the STATE of these buttons (showing/hiding based on login),
    // duplication is tricky unless we sync them. 
    // Better approach: CSS positioning. 
    // We can use Flexbox 'order' property to move authContainer to the left on mobile!

})();
