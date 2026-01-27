/**
 * signup.js - Signup Page Script
 * Handles signup form submission, password validation, and visibility toggle
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
                        // Redirect to dashboard on successful signup
                        window.location.href = "my-resumes.html";
                    }
                });
            }
        } catch (err) {
            console.error("Supabase initialization failed:", err);
        }

        setupSignupForm();
        setupPasswordToggle();
        setupPasswordValidation();
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

    // --- PASSWORD VALIDATION ---
    function setupPasswordValidation() {
        const password = $('password');
        const confirmPassword = $('confirmPassword');

        if (confirmPassword) {
            confirmPassword.addEventListener('input', () => {
                if (password.value !== confirmPassword.value) {
                    confirmPassword.setCustomValidity("Passwords do not match");
                } else {
                    confirmPassword.setCustomValidity("");
                }
            });

            password.addEventListener('input', () => {
                if (confirmPassword.value && password.value !== confirmPassword.value) {
                    confirmPassword.setCustomValidity("Passwords do not match");
                } else {
                    confirmPassword.setCustomValidity("");
                }
            });
        }
    }

    // --- SIGNUP FORM SUBMISSION ---
    function setupSignupForm() {
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

            // Get form values
            const username = $('username').value.trim();
            const email = $('email').value.trim();
            const password = $('password').value;
            const confirmPassword = $('confirmPassword').value;

            // Client-side validation
            if (!username) {
                showError(errorDiv, "Please enter your full name.");
                return;
            }

            if (password.length < 6) {
                showError(errorDiv, "Password must be at least 6 characters.");
                return;
            }

            if (password !== confirmPassword) {
                showError(errorDiv, "Passwords do not match.");
                return;
            }

            // Disable button and show loading
            btn.disabled = true;
            btn.textContent = "Creating account...";
            window.showLoader("Creating your account...");

            try {
                if (!window._supabase) {
                    throw new Error("Authentication service unavailable. Please try again.");
                }

                // Perform signup
                const { data, error } = await window._supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { username }
                    }
                });

                if (error) throw error;

                // Check if email confirmation is required
                if (data?.user?.identities?.length === 0) {
                    throw new Error("An account with this email already exists.");
                }

                // Success
                const successDiv = $('authMessage');
                if (successDiv) {
                    successDiv.textContent = "Account created successfully! Redirecting...";
                    successDiv.style.display = 'block';
                }
                setTimeout(() => {
                    window.location.href = "my-resumes.html";
                }, 1000);

            } catch (err) {
                console.error("Signup error:", err);

                // Show error message
                const errorMessage = getErrorMessage(err);
                showError(errorDiv, errorMessage);

                // Reset button
                btn.disabled = false;
                btn.textContent = originalText;

            } finally {
                window.hideLoader();
            }
        });
    }

    // --- HELPER FUNCTIONS ---
    function showError(errorDiv, message) {
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    function getErrorMessage(err) {
        const message = err.message || "An error occurred";

        // User-friendly error messages
        if (message.includes("already registered") || message.includes("already exists")) {
            return "An account with this email already exists. Please login instead.";
        }
        if (message.includes("Invalid email")) {
            return "Please enter a valid email address.";
        }
        if (message.includes("Password should be")) {
            return "Password must be at least 6 characters long.";
        }
        if (message.includes("Too many requests")) {
            return "Too many signup attempts. Please wait a moment.";
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
