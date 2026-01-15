/**
 * AI Builder Page - Login Gate
 * Redirects to login page if user is not authenticated
 */

(async function () {
    "use strict";

    const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? ""
        : "https://ai-latex-resume-builder.onrender.com";

    let supabase = null;
    let currentUser = null;

    // Initialize Supabase
    async function initSupabase() {
        try {
            const resp = await fetch(`${API_BASE}/api/config`);
            if (!resp.ok) throw new Error(`Server responded with ${resp.status}`);
            const config = await resp.json();

            if (config.supabaseUrl && config.supabaseAnonKey) {
                supabase = window.supabase.createClient(
                    config.supabaseUrl.trim(),
                    config.supabaseAnonKey.trim()
                );

                // Get current session
                const { data: { session } } = await supabase.auth.getSession();
                currentUser = session?.user || null;

                return currentUser;
            }
        } catch (err) {
            console.error('Failed to initialize Supabase:', err);
            return null;
        }
    }

    // Check authentication and redirect if needed
    async function checkAuthAndRedirect() {
        const user = await initSupabase();

        // If not logged in, redirect to login page
        if (!user) {
            console.log('User not logged in, redirecting to login page...');
            window.location.href = 'login.html';
            return false;
        }

        console.log('User authenticated:', user.email);
        return true;
    }

    // Add event listener to upload button
    function setupUploadButton() {
        const uploadBtn = document.getElementById('uploadBtn');

        if (uploadBtn) {
            uploadBtn.addEventListener('click', async (e) => {
                // Check authentication before allowing upload
                const isAuthenticated = await checkAuthAndRedirect();

                if (!isAuthenticated) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            });
        }
    }

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupUploadButton);
    } else {
        setupUploadButton();
    }

})();
