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
        setupTermsModal();
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

    // --- PASSWORD VALIDATION & STRENGTH ---
    function setupPasswordValidation() {
        const password = $('password');
        const confirmPassword = $('confirmPassword');
        const strengthBar = $('strengthBar');
        const strengthLabel = $('strengthLabel');

        const requirements = {
            length: (val) => val.length >= 8,
            upper: (val) => /[A-Z]/.test(val),
            lower: (val) => /[a-z]/.test(val),
            number: (val) => /[0-9]/.test(val),
            special: (val) => /[^A-Za-z0-9]/.test(val)
        };

        const pills = {
            length: $('req-length'),
            upper: $('req-upper'),
            lower: $('req-lower'),
            number: $('req-number'),
            special: $('req-special')
        };

        const updateStrength = () => {
            const val = password.value;
            let score = 0;

            // Update Pills & Calculate Score
            Object.keys(requirements).forEach(key => {
                const isValid = requirements[key](val);
                if (isValid) score++;

                if (pills[key]) {
                    if (isValid) pills[key].classList.add('valid');
                    else pills[key].classList.remove('valid');
                }
            });

            // Update Strength Bar & Label
            const strengthStyles = {
                0: { color: '#ef4444', label: 'Very Weak', width: '10%' },
                1: { color: '#ef4444', label: 'Very Weak', width: '20%' },
                2: { color: '#f97316', label: 'Weak', width: '40%' },
                3: { color: '#f59e0b', label: 'Fair', width: '60%' },
                4: { color: '#10b981', label: 'Strong', width: '80%' },
                5: { color: '#10b981', label: 'Very Strong', width: '100%' }
            };

            const style = strengthStyles[score] || strengthStyles[0];
            strengthBar.style.width = style.width;
            strengthBar.style.background = style.color; // Changed to .background to clear gradients
            strengthLabel.textContent = style.label;
            strengthLabel.style.color = style.color;

            // Validation logic
            if (confirmPassword.value && val !== confirmPassword.value) {
                confirmPassword.setCustomValidity("Passwords do not match");
            } else {
                confirmPassword.setCustomValidity("");
            }
        };

        password.addEventListener('input', updateStrength);

        // Initialize state
        updateStrength();

        if (confirmPassword) {
            confirmPassword.addEventListener('input', () => {
                if (password.value !== confirmPassword.value) {
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
        const termsCheck = $('termsCheck');
        const submitBtn = $('submitBtn');

        if (!form) return;

        // Toggle button states based on checkbox
        termsCheck.addEventListener('change', () => {
            submitBtn.style.opacity = termsCheck.checked ? '1' : '0.5';
            submitBtn.style.cursor = termsCheck.checked ? 'pointer' : 'not-allowed';
        });

        // Initial state
        submitBtn.style.opacity = termsCheck.checked ? '1' : '0.5';
        submitBtn.style.cursor = termsCheck.checked ? 'pointer' : 'not-allowed';

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
            const termsChecked = $('termsCheck').checked;

            // Client-side validation
            if (!username) {
                showError(errorDiv, "Please enter your full name.");
                return;
            }


            if (password.length < 8) {
                showError(errorDiv, "Password must be at least 8 characters.");
                return;
            }

            if (password !== confirmPassword) {
                showError(errorDiv, "Passwords do not match.");
                return;
            }

            if (!termsChecked) {
                showError(errorDiv, "You must agree to the Terms and Conditions.");
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
                        data: {
                            username,
                            full_name: username
                        }
                    }
                });

                if (error) throw error;

                // Check if account already exists (Supabase might return no user if it already exists depending on config)
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
            errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        if (message.includes("Password should be") || message.includes("weak_password")) {
            return "Password is too weak. Please include uppercase, numbers, and special characters.";
        }
        if (message.includes("Too many requests")) {
            return "Too many signup attempts. Please wait a moment.";
        }

        return message;
    }

    // --- TERMS MODAL LOGIC ---
    function setupTermsModal() {
        const modal = $('termsModal');
        const link = $('termsLink');
        const closeBtn = $('closeTermsBtn');
        const acceptBtn = $('acceptTermsBtn');
        const termsCheck = $('termsCheck');
        const submitBtn = $('submitBtn');

        if (!modal || !link) return;

        link.onclick = (e) => {
            e.preventDefault();
            modal.classList.add('active');
        };

        const closeModal = () => modal.classList.remove('active');
        closeBtn.onclick = closeModal;
        acceptBtn.onclick = () => {
            termsCheck.checked = true;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
            closeModal();
        };

        window.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
    }

    // --- Start ---
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
