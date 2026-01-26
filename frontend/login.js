/**
 * login.js - Login Page Script
 * Handles login form submission and password visibility toggle
 * Dependencies: common.js, auth-core.js
 */

(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);

    // --- INITIALIZATION ---
    async function init() {
        window.initLoader();

        try {
            // Initialize Supabase if not already done
            if (!window._supabase) {
                await window.initSupabase((event, session) => {
                    if (event === "SIGNED_IN" && session?.user) {
                        // Redirect to dashboard on successful login
                        window.location.href = "my-resumes.html";
                    }
                });
            }
        } catch (err) {
            console.error("Supabase initialization failed:", err);
        }

        setupLoginForm();
        setupPasswordToggle();
    }

    // --- PASSWORD VISIBILITY TOGGLE ---
    function setupPasswordToggle() {
        document.querySelectorAll('.password-toggle').forEach(btn => {
            btn.addEventListener('click', function () {
                const input = this.previousElementSibling;
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);

                // Update icon
                const iconName = type === 'password' ? 'eye' : 'eye-off';
                if (window.lucide) {
                    this.innerHTML = `<i data-lucide="${iconName}"></i>`;
                    window.lucide.createIcons();
                } else {
                    this.textContent = type === 'password' ? '👁' : '🚫';
                }
            });
        });
    }

    // --- LOGIN FORM SUBMISSION ---
    function setupLoginForm() {
        const form = $('authForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const btn = $('submitBtn');
            const originalText = btn.textContent;
            const errorDiv = $('authErrorMsg');

            // Clear previous errors
            if (errorDiv) {
                errorDiv.textContent = '';
                errorDiv.style.display = 'none';
            }

            // Disable button and show loading
            btn.disabled = true;
            btn.textContent = "Logging in...";
            window.showLoader("Authenticating...");

            const email = $('email').value.trim();
            const password = $('password').value;

            try {
                if (!window._supabase) {
                    throw new Error("Authentication service unavailable. Please try again.");
                }

                // Perform login
                const { data, error } = await window._supabase.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) throw error;

                // Success - redirect to dashboard
                window.showToast("Login successful!", "success");
                window.location.href = "my-resumes.html";

            } catch (err) {
                console.error("Login error:", err);

                // Show error message
                const errorMessage = getErrorMessage(err);
                if (errorDiv) {
                    errorDiv.textContent = errorMessage;
                    errorDiv.style.display = 'block';
                }
                window.showToast(errorMessage, "error");

                // Reset button
                btn.disabled = false;
                btn.textContent = originalText;

            } finally {
                window.hideLoader();
            }
        });
    }

    // --- ERROR MESSAGE HELPER ---
    function getErrorMessage(err) {
        const message = err.message || "An error occurred";

        // User-friendly error messages
        if (message.includes("Invalid login credentials")) {
            return "Invalid email or password. Please try again.";
        }
        if (message.includes("Email not confirmed")) {
            return "Please verify your email before logging in.";
        }
        if (message.includes("Too many requests")) {
            return "Too many login attempts. Please wait a moment.";
        }

        return message;
    }

    // --- Start ---
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
