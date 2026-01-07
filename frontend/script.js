
(function () {
    "use strict";

    function $(id) { return document.getElementById(id); }

    const pdfInput = $("pdfInput");
    const uploadBtn = $("uploadBtn");
    const statusBadge = $("statusBadge");
    const latexEditor = $("latexEditor");
    const recompileBtn = $("recompileBtn");
    const downloadBtn = $("downloadBtn");
    const compileLog = $("compileLog");
    const pdfFrame = $("pdfFrame");
    const toastContainer = $("toastContainer");

    // Supabase Initialization
    let supabase = null;

    async function initSupabase() {
        try {
            const resp = await fetch("/api/config");
            const config = await resp.json();

            if (config.supabaseUrl && config.supabaseAnonKey && (config.supabaseAnonKey.trim().length > 20)) {
                const url = config.supabaseUrl.trim();
                const key = config.supabaseAnonKey.trim();
                supabase = window.supabase.createClient(url, key);

                // Set up listener immediately after initialization
                supabase.auth.onAuthStateChange(async (event, session) => {

                    // Unified state update
                    currentUser = session?.user || null;
                    updateAuthUI(session);

                    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
                        if (session?.user) {
                            // CLOSE MODAL IMMEDIATELY - Don't wait for data
                            closeModal();
                            loadLastSavedResume(); // No await here to prevent blocking UI
                        }
                    } else if (event === "SIGNED_OUT") {
                        latexEditor.value = "";
                        setPdfSrc(null);
                        recompileBtn.disabled = true;
                        downloadBtn.disabled = true;
                        currentUser = null;
                        updateAuthUI(null);
                        closeModal();
                    } else if (event === "PASSWORD_RECOVERY") {
                        setAuthUI("update");
                        openModal();
                    }
                });
            } else {
                console.warn("Supabase credentials missing in .env");
            }
        } catch (err) {
            console.error("Failed to load Supabase config:", err);
        }
    }

    // Auth Elements
    const authBtn = $("authBtn");
    const logoutBtn = $("logoutBtn");
    const userProfile = $("userProfile");
    const displayUserName = $("displayUserName");
    const authModal = $("authModal");
    const authForm = $("authForm");
    const modalTitle = $("modalTitle");
    const submitBtn = $("submitBtn");
    const toggleAuth = $("toggleAuth");
    const toggleText = $("toggleText");
    const closeBtn = document.querySelector(".close");

    // New Auth Elements
    const usernameField = $("username");
    const emailField = $("email");
    const passwordField = $("password");
    const confirmPasswordField = $("confirmPassword");
    const authMessage = $("authMessage");
    const authErrorMsg = $("authErrorMsg");
    const forgotBtn = $("forgotBtn");
    const backBtn = $("backBtn");
    const backToLogin = $("backToLogin");
    const forgotPasswordLink = $("forgotPasswordLink");

    let authMode = "login"; // 'login', 'signup', 'forgot'
    let currentUser = null;
    let isAuthenticating = false;

    function setAuthUI(mode) {
        authMode = mode;
        authErrorMsg.style.display = "none";
        authMessage.style.display = "none";
        submitBtn.style.display = "block";
        emailField.style.display = "block";

        if (mode === "login") {
            modalTitle.textContent = "Login";
            submitBtn.textContent = "Login";
            usernameField.style.display = "none";
            usernameField.required = false;
            passwordField.style.display = "block";
            passwordField.required = true;
            toggleText.style.display = "block";
            toggleText.innerHTML = "Don't have an account? <span id='toggleAuth'>Sign Up</span>";
            backToLogin.style.display = "none";
            forgotPasswordLink.style.display = "block";
            $("toggleAuth").onclick = () => setAuthUI("signup");
        } else if (mode === "signup") {
            modalTitle.textContent = "Sign Up";
            submitBtn.textContent = "Create Account";
            usernameField.style.display = "block";
            usernameField.required = true;
            passwordField.style.display = "block";
            passwordField.required = true;
            toggleText.style.display = "block";
            toggleText.innerHTML = "Already have an account? <span id='toggleAuth'>Login</span>";
            backToLogin.style.display = "none";
            forgotPasswordLink.style.display = "none";
            $("toggleAuth").onclick = () => setAuthUI("login");
        } else if (mode === "forgot") {
            modalTitle.textContent = "Reset Password";
            submitBtn.textContent = "Send Reset Link";
            usernameField.style.display = "none";
            usernameField.required = false;
            passwordField.style.display = "none";
            passwordField.required = false;
            toggleText.style.display = "none";
            backToLogin.style.display = "block";
            forgotPasswordLink.style.display = "none";
            $("backBtn").onclick = () => setAuthUI("login");
        } else if (mode === "update") {
            modalTitle.textContent = "Update Password";
            submitBtn.textContent = "Save New Password";
            usernameField.style.display = "none";
            usernameField.required = false;
            emailField.style.display = "none";
            emailField.required = false;
            passwordField.style.display = "block";
            passwordField.placeholder = "New Password";
            confirmPasswordField.style.display = "block";
            confirmPasswordField.required = true;
            toggleText.style.display = "none";
            backToLogin.style.display = "none";
            forgotPasswordLink.style.display = "none";
        }
    }

    // Toast notification system
    function showToast(title, message, type = "info") {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        const icons = {
            success: "✓",
            error: "✕",
            warning: "⚠",
            info: "ℹ"
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ""}
            </div>
        `;

        toastContainer.appendChild(toast);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.classList.add("toast-hiding");
            setTimeout(() => {
                if (toast.parentNode) {
                    toastContainer.removeChild(toast);
                }
            }, 300);
        }, 5000);
    }

    // Enhanced status update with type
    function setStatus(text, type) {
        statusBadge.textContent = text;
        statusBadge.className = "status-badge status-" + type;
    }

    function setLoading(isLoading) {
        uploadBtn.disabled = isLoading;
        recompileBtn.disabled = isLoading || !latexEditor.value.trim();
        downloadBtn.disabled = isLoading;
    }

    function setPdfSrc(url) {
        if (!url) {
            pdfFrame.setAttribute("src", "");
            return;
        }
        // Remove old timestamp if it exists to avoid double ???
        const cleanUrl = url.split("?")[0];
        const bust = cleanUrl + "?t=" + Date.now();
        pdfFrame.setAttribute("src", bust);
    }

    // Error categorization and user-friendly messages
    function getErrorInfo(data, defaultMessage) {
        const errorCode = data?.code || "";
        const errorMessage = data?.error || defaultMessage;
        const errorDetails = data?.details || "";

        // Map error codes to user-friendly messages
        const errorMap = {
            "NO_FILE": {
                title: "No File Selected",
                message: "Please select a PDF file before uploading.",
                type: "warning"
            },
            "INVALID_FILE_TYPE": {
                title: "Invalid File Type",
                message: "Only PDF files are supported. Please select a valid PDF.",
                type: "error"
            },
            "FILE_TOO_LARGE": {
                title: "File Too Large",
                message: "Maximum file size is 20MB. Please use a smaller PDF.",
                type: "error"
            },
            "PDF_EXTRACTION_FAILED": {
                title: "Cannot Extract Text",
                message: "The PDF appears to be empty or image-based. Please use a PDF with selectable text.",
                type: "error"
            },
            "AI_SERVICE_ERROR": {
                title: "AI Service Unavailable",
                message: "The AI service is temporarily unavailable. Please try again in a few moments.",
                type: "warning"
            },
            "LATEX_COMPILATION_FAILED": {
                title: "LaTeX Compilation Error",
                message: errorDetails || "There was an error compiling the LaTeX. Check the compile log for details.",
                type: "error"
            },
            "INVALID_LATEX": {
                title: "Invalid LaTeX",
                message: "Please enter valid LaTeX code before recompiling.",
                type: "warning"
            },
            "EMPTY_LATEX": {
                title: "Empty Editor",
                message: "The LaTeX editor is empty. Please add content before compiling.",
                type: "warning"
            }
        };

        if (errorCode && errorMap[errorCode]) {
            return errorMap[errorCode];
        }

        // Default error info
        return {
            title: errorMessage,
            message: errorDetails || "An unexpected error occurred. Please try again.",
            type: "error"
        };
    }

    async function uploadPdf() {
        const file = pdfInput.files && pdfInput.files[0];
        if (!file) {
            setStatus("Please select a PDF first", "warning");
            showToast("No File Selected", "Please select a PDF file to upload.", "warning");
            return;
        }

        const fd = new FormData();
        fd.append("pdf", file);

        setLoading(true);
        setStatus("Uploading and generating LaTeX...", "loading");
        compileLog.textContent = "";
        compileLog.classList.remove("has-error");

        try {
            const resp = await fetch("/api/upload", { method: "POST", body: fd });
            const data = await resp.json();

            if (!resp.ok) {
                const errorInfo = getErrorInfo(data, "Upload failed");
                throw { info: errorInfo, data };
            }

            latexEditor.value = (data.latex || "").trim();
            setPdfSrc(data.pdfUrl || "/files/resume.pdf");

            setStatus("Compiled successfully", "success");
            showToast("Success!", "Resume generated successfully.", "success");

            recompileBtn.disabled = !latexEditor.value.trim();
            downloadBtn.disabled = false;

            if (!compileLog.textContent) {
                compileLog.textContent = "Initial compile completed successfully.";
            }

            // Save to Database if logged in
            if (currentUser) {
                await saveToSupabase(data.latex, data.pdfUrl || "/files/resume.pdf");
            }
        } catch (err) {
            setStatus("Upload failed", "error");
            compileLog.classList.add("has-error");

            if (err.info) {
                showToast(err.info.title, err.info.message, err.info.type);
                compileLog.textContent = err.data?.details || err.info.message;
            } else if (err.message) {
                showToast("Upload Failed", err.message, "error");
                compileLog.textContent = err.message;
            } else {
                showToast("Upload Failed", "An unexpected error occurred.", "error");
                compileLog.textContent = "Upload processing failed. Please try again.";
            }
        } finally {
            setLoading(false);
        }
    }

    async function recompileLatex() {
        const latex = latexEditor.value || "";
        if (!latex.trim()) {
            setStatus("Enter LaTeX before recompiling", "warning");
            showToast("Empty Editor", "Please enter LaTeX code before recompiling.", "warning");
            return;
        }

        setLoading(true);
        setStatus("Compiling LaTeX...", "loading");
        compileLog.classList.remove("has-error");

        try {
            const resp = await fetch("/api/recompile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ latex })
            });
            const data = await resp.json();

            if (!resp.ok) {
                const errorInfo = getErrorInfo(data, "Recompile failed");
                throw { info: errorInfo, data };
            }

            setPdfSrc(data.pdfUrl || "/files/resume.pdf");
            compileLog.textContent = (data.log || "Compilation successful.").trim();
            setStatus("Compiled successfully", "success");
            showToast("Success!", "LaTeX compiled successfully.", "success");
            downloadBtn.disabled = false;

            // Save updated version to Database if logged in
            if (currentUser) {
                await saveToSupabase(latex, data.pdfUrl || "/files/resume.pdf");
            }
        } catch (err) {
            setStatus("Compilation failed", "error");
            compileLog.classList.add("has-error");

            if (err.info) {
                showToast(err.info.title, err.info.message, err.info.type);
                compileLog.textContent = err.data?.log || err.data?.details || err.info.message;
            } else if (err.message) {
                showToast("Compilation Failed", err.message, "error");
                compileLog.textContent = err.message;
            } else {
                showToast("Compilation Failed", "An unexpected error occurred.", "error");
                compileLog.textContent = "Recompile failed. Please check your LaTeX syntax.";
            }
        } finally {
            setLoading(false);
        }
    }

    function downloadPdf() {
        window.open("/api/download", "_blank");
    }

    async function saveToSupabase(latex, pdfUrl) {
        if (!supabase) {
            console.error("Supabase client not found.");
            return;
        }
        if (!currentUser) {
            return;
        }

        try {
            let permanentPdfUrl = pdfUrl;

            // 1. Upload to Storage if it's the local temp PDF
            if (pdfUrl.startsWith("/files/") || pdfUrl.includes("localhost") || pdfUrl.startsWith("http://127.0.0.1")) {
                try {
                    // Use a very unique URL to bypass ANY browser caching
                    const fetchUrl = `/files/resume.pdf?v=${Date.now()}`;

                    const pdfBlob = await fetch(fetchUrl, { cache: "no-store" }).then(r => r.blob());
                    // Fixed filename: one PDF per user
                    const fileName = `${currentUser.id}/resume.pdf`;

                    // 1a. Explicitly remove old file to ensure clean replacement (bypasses upsert quirks)
                    await supabase.storage
                        .from('resumes')
                        .remove([fileName]);

                    // 1b. Upload fresh blob
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('resumes')
                        .upload(fileName, pdfBlob, {
                            contentType: 'application/pdf',
                            cacheControl: '0', // Tell Supabase not to cache this
                            upsert: true
                        });

                    if (uploadError) throw uploadError;

                    const { data: urlData } = supabase.storage
                        .from('resumes')
                        .getPublicUrl(fileName);

                    // Add cache buster to the URL for immediate UI update
                    permanentPdfUrl = urlData.publicUrl + "?t=" + Date.now();
                } catch (storageErr) {
                    console.warn("Storage upload failed, using local link:", storageErr);
                }
            }

            // 2. Upsert Database Record
            const { data, error } = await supabase
                .from("resumes")
                .upsert({
                    user_id: currentUser.id,
                    title: "My Resume",
                    latex_content: latex,
                    pdf_url: permanentPdfUrl,
                    created_at: new Date().toISOString()
                }, { onConflict: 'user_id,title' });

            if (error) {
                console.error("Supabase Upsert Error:", error);
                throw error;
            }
            showToast("Saved", "Resume progress saved to cloud.", "success");
        } catch (err) {
            console.error("Detailed Save Error:", err);
            showToast("Cloud Sync Failed", "Progress not saved to database. Check console.", "warning");
        }
    }

    // Auth Functions
    async function loadLastSavedResume() {
        if (!supabase || !currentUser) {
            return;
        }

        try {
            const { data, error } = await supabase
                .from("resumes")
                .select("*")
                .eq("user_id", currentUser.id)
                .eq("title", "My Resume")
                .maybeSingle(); // Better than .single() as it doesn't throw 406 on empty

            if (error) {
                console.error("Database query error:", error);
                throw error;
            }

            if (data) {
                latexEditor.value = data.latex_content || "";
                if (data.pdf_url) {
                    setPdfSrc(data.pdf_url);
                    downloadBtn.disabled = false;
                }
                recompileBtn.disabled = !latexEditor.value.trim();
                compileLog.textContent = "Welcome back! Your previously saved resume has been loaded successfully.";
                compileLog.classList.remove("has-error");
                setStatus("Latest version loaded", "success");
            }
        } catch (err) {
            console.error("Failed to load resume:", err);
            showToast("Load Failed", "Check console for details.", "warning");
        }
    }

    async function handleAuth(e) {
        e.preventDefault();

        if (isAuthenticating) return;
        isAuthenticating = true;

        if (!supabase) {
            console.error("Supabase client not ready yet.");
            showToast("Connecting...", "Still establishing connection to the server. Please wait.", "info");
            isAuthenticating = false;
            return;
        }

        const email = emailField.value;
        const password = passwordField.value;
        const username = usernameField.value;

        authErrorMsg.style.display = "none";
        authMessage.style.display = "none";
        setLoading(true);

        try {
            if (authMode === "login") {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else if (authMode === "signup") {
                if (!username.trim()) throw new Error("Full Name is mandatory.");
                const { data, error } = await supabase.auth.signUp({
                    email, password, options: { data: { username } }
                });
                if (error) throw error;

                if (!data.session) {
                    authMessage.textContent = "Confirmation email sent! Check " + email;
                    authMessage.style.display = "block";
                }
            } else if (authMode === "forgot") {
                const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
                if (error) throw error;
                authMessage.textContent = "Reset link sent! Check " + email;
                authMessage.style.display = "block";
            } else if (authMode === "update") {
                if (password !== confirmPasswordField.value) throw new Error("Passwords mismatch.");
                const { error } = await supabase.auth.updateUser({ password });
                if (error) throw error;
                showToast("Updated", "Password changed.", "success");
            }
        } catch (err) {
            console.error("Auth Exception:", err);
            authErrorMsg.textContent = err.message;
            authErrorMsg.style.display = "block";
        } finally {
            setLoading(false);
            isAuthenticating = false;
        }
    }

    async function handleLogout() {
        if (supabase) {
            try {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                showToast("Logged Out", "See you again!", "info");
            } catch (err) {
                console.error("Logout error:", err);
                // Force UI update even on error
                currentUser = null;
                updateAuthUI(null);
            }
        }
    }

    function updateAuthUI(sessionData) {
        if (!supabase) return;

        // Use provided session or keep current state
        const user = sessionData?.user || currentUser;
        currentUser = user;

        if (user) {
            authBtn.style.display = "none";
            userProfile.style.display = "flex";

            let displayName = user.user_metadata?.username ||
                user.user_metadata?.full_name ||
                user.email ||
                "User";

            if (displayName && !displayName.includes("@")) {
                displayName = displayName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
            }
            displayUserName.textContent = displayName;
        } else {
            authBtn.style.display = "block";
            userProfile.style.display = "none";
            displayUserName.textContent = "";
        }
    }

    function openModal() {
        setAuthUI("login");
        authModal.style.display = "block";
    }

    function closeModal() {
        authModal.style.display = "none";
        authForm.reset();
    }


    let hasInitialized = false;
    function init() {
        if (hasInitialized) return;
        hasInitialized = true;

        setStatus("Ready", "ready");
        recompileBtn.disabled = true;
        downloadBtn.disabled = true;

        initSupabase();

        uploadBtn.addEventListener("click", uploadPdf);
        recompileBtn.addEventListener("click", recompileLatex);
        downloadBtn.addEventListener("click", downloadPdf);

        authBtn.addEventListener("click", openModal);
        logoutBtn.addEventListener("click", handleLogout);
        closeBtn.addEventListener("click", closeModal);
        window.addEventListener("click", (e) => { if (e.target === authModal) closeModal(); });

        forgotBtn.onclick = () => setAuthUI("forgot");
        authForm.addEventListener("submit", handleAuth);

        pdfInput.addEventListener("change", function () {
            if (pdfInput.files && pdfInput.files.length) {
                setStatus("PDF selected", "ready");
            } else {
                setStatus("Ready", "ready");
            }
        });

        latexEditor.addEventListener("input", function () {
            recompileBtn.disabled = !latexEditor.value.trim();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
