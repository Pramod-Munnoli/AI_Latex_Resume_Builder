
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
    const mobilePdfLink = $("mobilePdfLink");
    const toastContainer = $("toastContainer");

    // Auth elements
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

    // Form fields
    const usernameField = $("username");
    const emailField = $("email");
    const passwordField = $("password");
    const confirmPasswordField = $("confirmPassword");
    const authMessage = $("authMessage");
    const authErrorMsg = $("authErrorMsg");
    const forgotBtn = $("forgotBtn");
    const errorPanel = $("errorPanel");
    const closeError = $("closeError");
    const backBtn = $("backBtn");
    const backToLogin = $("backToLogin");
    const forgotPasswordLink = $("forgotPasswordLink");

    // --- CLOUD CONFIGURATION ---
    // Change this to your Render URL when it is Live!
    const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? ""
        : "https://ai-latex-resume-builder.onrender.com";

    // Global Supabase client (must be declared at module scope)
    let supabase = null;

    async function initSupabase() {
        try {
            console.log("Connecting to backend at:", API_BASE || "local");
            const resp = await fetch(`${API_BASE}/api/config`);

            if (!resp.ok) throw new Error(`Server responded with ${resp.status}`);
            const config = await resp.json();

            if (config.supabaseUrl && config.supabaseAnonKey) {
                const url = config.supabaseUrl.trim();
                const key = config.supabaseAnonKey.trim();

                try {
                    supabase = window.supabase.createClient(url, key);

                    // Set up listener immediately after initialization
                    supabase.auth.onAuthStateChange(async (event, session) => {

                        // Unified state update
                        currentUser = session?.user || null;
                        updateAuthUI(session);

                        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
                            if (session?.user) {
                                // Check if this is a password recovery flow
                                const isRecovery = window.location.hash && window.location.hash.includes("type=recovery");

                                if (isRecovery) {
                                    // FORCE password update UI and keep modal open
                                    setAuthUI("update");
                                    authMessage.textContent = "Please set a new password to secure your account.";
                                    authMessage.style.display = "block";
                                    openModal();
                                    // We do NOT clear the hash here; let Supabase process it or clear it after successful update
                                } else {
                                    // Normal Login: Close modal
                                    closeModal();

                                    // Redirect to home if on standalone auth pages
                                    const path = window.location.pathname;
                                    if (path.includes("login.html") || path.includes("signup.html")) {
                                        window.location.href = "index.html";
                                    }
                                }
                                loadLastSavedResume();
                            }
                        } else if (event === "SIGNED_OUT") {
                            if (latexEditor) latexEditor.value = "";
                            setPdfSrc(null);
                            if (recompileBtn) recompileBtn.disabled = true;
                            if (downloadBtn) downloadBtn.disabled = true;
                            currentUser = null;
                            updateAuthUI(null);
                            closeModal();
                        } else if (event === "PASSWORD_RECOVERY") {
                            // Clear the URL hash so the token doesn't persist in the address bar
                            window.history.replaceState(null, null, window.location.pathname);
                            setAuthUI("update");
                            authMessage.textContent = "You've been logged in. Please set a new password below.";
                            authMessage.style.display = "block";
                            openModal();
                        }
                    });
                } catch (authError) {
                    // Handle stale/invalid refresh token errors
                    if (authError.message && authError.message.includes("refresh_token")) {
                        console.warn("Detected stale refresh token, clearing localStorage...", authError);

                        // Clear all Supabase-related keys from localStorage
                        const storageKeys = Object.keys(localStorage);
                        storageKeys.forEach(key => {
                            if (key.startsWith('sb-')) {
                                localStorage.removeItem(key);
                            }
                        });

                        // Re-initialize the client with clean state
                        supabase = window.supabase.createClient(url, key);
                        console.log("Supabase re-initialized with clean state.");
                        showToast("Session Cleared", "Please log in again.", "info");
                    } else {
                        throw authError;
                    }
                }
            } else {
                console.warn("Supabase credentials missing in .env");
                showToast("Configuration Error", "Supabase credentials not configured. Authentication disabled.", "warning");
            }
        } catch (err) {
            console.error("Failed to load Supabase config:", err);
            showToast("Connection Error", "Failed to connect to authentication service. Please refresh the page.", "error");
        }
    }



    let authMode = "login"; // 'login', 'signup', 'forgot'
    let currentUser = null;
    let isAuthenticating = false;

    function setAuthUI(mode) {
        authMode = mode;
        if (authErrorMsg) authErrorMsg.style.display = "none";
        if (authMessage) authMessage.style.display = "none";
        if (submitBtn) submitBtn.style.display = "block";
        if (emailField) emailField.style.display = "block";

        if (mode === "login") {
            if (modalTitle) modalTitle.textContent = "Login";
            if (submitBtn) submitBtn.textContent = "Login";
            if (usernameField) {
                usernameField.style.display = "none";
                usernameField.required = false;
            }
            if (passwordField) {
                passwordField.style.display = "block";
                passwordField.required = true;
            }
            if (toggleText) {
                toggleText.style.display = "block";
                toggleText.innerHTML = "Don't have an account? <span id='toggleAuth'>Sign Up</span>";
                const tAuth = $("toggleAuth");
                if (tAuth) tAuth.onclick = () => setAuthUI("signup");
            }
            if (backToLogin) backToLogin.style.display = "none";
            if (forgotPasswordLink) forgotPasswordLink.style.display = "block";
        } else if (mode === "signup") {
            if (modalTitle) modalTitle.textContent = "Sign Up";
            if (submitBtn) submitBtn.textContent = "Create Account";
            if (usernameField) {
                usernameField.style.display = "block";
                usernameField.required = true;
            }
            if (passwordField) {
                passwordField.style.display = "block";
                passwordField.required = true;
            }
            if (toggleText) {
                toggleText.style.display = "block";
                toggleText.innerHTML = "Already have an account? <span id='toggleAuth'>Login</span>";
                const tAuth = $("toggleAuth");
                if (tAuth) tAuth.onclick = () => setAuthUI("login");
            }
            if (backToLogin) backToLogin.style.display = "none";
            if (forgotPasswordLink) forgotPasswordLink.style.display = "none";
        } else if (mode === "forgot") {
            if (modalTitle) modalTitle.textContent = "Reset Password";
            if (submitBtn) submitBtn.textContent = "Send Reset Link";
            if (usernameField) {
                usernameField.style.display = "none";
                usernameField.required = false;
            }
            if (passwordField) {
                passwordField.style.display = "none";
                passwordField.required = false;
            }
            if (toggleText) toggleText.style.display = "none";
            if (backToLogin) {
                backToLogin.style.display = "block";
                const bBtn = $("backBtn");
                if (bBtn) bBtn.onclick = () => setAuthUI("login");
            }
            if (forgotPasswordLink) forgotPasswordLink.style.display = "none";
        } else if (mode === "update") {
            if (modalTitle) modalTitle.textContent = "Update Password";
            if (submitBtn) submitBtn.textContent = "Save New Password";
            if (usernameField) {
                usernameField.style.display = "none";
                usernameField.required = false;
            }
            if (emailField) {
                emailField.style.display = "none";
                emailField.required = false;
            }
            if (passwordField) {
                passwordField.style.display = "block";
                passwordField.placeholder = "New Password";
            }
            if (confirmPasswordField) {
                confirmPasswordField.style.display = "block";
                confirmPasswordField.required = true;
            }
            if (toggleText) toggleText.style.display = "none";
            if (backToLogin) backToLogin.style.display = "none";
            if (forgotPasswordLink) forgotPasswordLink.style.display = "none";
        }
    }

    // Toast notification system
    function showToast(title, message, type = "info") {
        // Disabled per user request to remove all popups
        console.log(`Toast suppressed: [${type}] ${title} - ${message}`);
    }

    // Enhanced status update with type
    function setStatus(text, type) {
        if (!statusBadge) return;
        statusBadge.textContent = text;
        statusBadge.className = "status-badge status-" + type;
    }

    function setLoading(isLoading) {
        if (uploadBtn) uploadBtn.disabled = isLoading;
        if (recompileBtn) recompileBtn.disabled = isLoading || (latexEditor && !latexEditor.value.trim());
        if (downloadBtn) downloadBtn.disabled = isLoading;
    }

    // ========================================
    // MODERN LOADING SYSTEM
    // ========================================

    let appLoader = null;
    let loaderMessage = null;

    function initLoader() {
        appLoader = document.getElementById('appLoader');
        loaderMessage = document.getElementById('appLoaderMessage');
    }

    function showLoader(message = 'Processing, please wait...') {
        if (!appLoader) initLoader();
        if (!appLoader) return;

        if (loaderMessage) loaderMessage.textContent = message;
        appLoader.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    }

    function hideLoader() {
        if (!appLoader) return;

        appLoader.classList.remove('active');
        document.body.style.overflow = ''; // Restore scrolling
    }

    function updateLoaderMessage(message) {
        if (loaderMessage) loaderMessage.textContent = message;
    }

    // Scroll to workspace helper
    function scrollToWorkspace() {
        const workspace = document.querySelector('.ai-builder-workspace');
        if (workspace) {
            workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }


    function setPdfSrc(url, isHtml = false, forceRefresh = false) {
        if (!pdfFrame) return;

        if (!url) {
            pdfFrame.removeAttribute("srcdoc");
            pdfFrame.setAttribute("src", "");
            if (mobilePdfLink) mobilePdfLink.style.display = "none";
            return;
        }

        if (isHtml) {
            pdfFrame.removeAttribute("src");
            pdfFrame.setAttribute("srcdoc", url);
            if (mobilePdfLink) mobilePdfLink.style.display = "none";
            return;
        }

        pdfFrame.removeAttribute("srcdoc");
        let fullUrl = url;
        // If it's a relative path (like /files/resume.pdf), add the API_BASE
        if (url.startsWith("/files/")) {
            fullUrl = API_BASE + url;
        }

        // Only append cache-buster if forceRefresh is true or if it's a relative path (always refresh local temp)
        const isLocal = url.startsWith("/files/");
        let bust = fullUrl;

        if (forceRefresh || isLocal) {
            const cleanUrl = fullUrl.split("?")[0];
            bust = cleanUrl + "?t=" + Date.now();
        }

        // Prevent redundant reloads if the URL hasn't changed and no refresh forced
        if (pdfFrame.getAttribute("src") === (bust + "#toolbar=0&navpanes=0") && !forceRefresh) {
            return;
        }

        const finalUrl = bust + "#toolbar=0&navpanes=0";
        pdfFrame.setAttribute("src", finalUrl);

        // Update Mobile link
        if (mobilePdfLink) {
            mobilePdfLink.href = finalUrl;
            if (window.innerWidth < 600) {
                mobilePdfLink.style.display = "block";
            }
        }
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
        showLoader('Uploading LinkedIn PDF...');
        setStatus("Uploading and generating LaTeX...", "loading");
        if (compileLog) compileLog.textContent = "";
        if (compileLog) compileLog.classList.remove("has-error");
        if (errorPanel) errorPanel.style.display = "none";

        try {
            const resp = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });
            updateLoaderMessage('Generating LaTeX resume...');
            const data = await resp.json();

            if (!resp.ok) {
                const errorInfo = getErrorInfo(data, "Upload failed");
                throw { info: errorInfo, data };
            }

            if (latexEditor) latexEditor.value = (data.latex || "").trim();
            setPdfSrc(data.pdfUrl || "/files/resume.pdf", false, true);

            setStatus("Compiled successfully", "success");
            showToast("Success!", "Resume generated successfully.", "success");

            if (recompileBtn) recompileBtn.disabled = (latexEditor && !latexEditor.value.trim());
            if (downloadBtn) downloadBtn.disabled = false;

            if (compileLog && !compileLog.textContent) {
                compileLog.textContent = "Initial compile completed successfully.";
            }

            // Save to Database if logged in
            if (currentUser) {
                await saveToSupabase(data.latex, data.pdfUrl || "/files/resume.pdf");
            }

            // Scroll to preview after generation
            scrollToWorkspace();
        } catch (err) {
            setStatus("Upload failed", "error");
            if (compileLog) {
                compileLog.classList.add("has-error");
                if (err.info) {
                    showToast(err.info.title, err.info.message, err.info.type);
                    compileLog.textContent = err.data?.details || err.info.message;
                    if (errorPanel) errorPanel.style.display = "block";
                } else if (err.message) {
                    showToast("Upload Failed", err.message, "error");
                    compileLog.textContent = err.message;
                } else {
                    showToast("Upload Failed", "An unexpected error occurred.", "error");
                    compileLog.textContent = "Upload processing failed. Please try again.";
                }
            } else if (err.info) {
                showToast(err.info.title, err.info.message, err.info.type);
            }
        } finally {
            setLoading(false);
            hideLoader();
        }
    }

    async function recompileLatex() {
        const latex = latexEditor ? latexEditor.value : "";
        if (!latex.trim()) {
            setStatus("Enter LaTeX before recompiling", "warning");
            showToast("Empty Editor", "Please enter LaTeX code before recompiling.", "warning");
            return;
        }

        setLoading(true);
        showLoader('Compiling PDF...');
        setStatus("Compiling LaTeX...", "loading");
        compileLog.classList.remove("has-error");

        try {
            const resp = await fetch(`${API_BASE}/api/recompile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ latex })
            });
            const data = await resp.json();

            if (!resp.ok) {
                const errorInfo = getErrorInfo(data, "Recompile failed");
                throw { info: errorInfo, data };
            }

            setPdfSrc(data.pdfUrl || "/files/resume.pdf", false, true);
            if (compileLog) compileLog.textContent = (data.log || "Compilation successful.").trim();
            setStatus("Compiled successfully", "success");
            showToast("Success!", "LaTeX compiled successfully.", "success");
            if (downloadBtn) downloadBtn.disabled = false;

            // Save updated version to Database if logged in
            if (currentUser) {
                updateLoaderMessage('Saving to cloud...');
                await saveToSupabase(latex, data.pdfUrl || "/files/resume.pdf");
            }

            // Scroll to preview after compilation
            scrollToWorkspace();
        } catch (err) {
            setStatus("Compilation failed", "error");
            if (compileLog) {
                compileLog.classList.add("has-error");
                if (err.info) {
                    showToast(err.info.title, err.info.message, err.info.type);
                    compileLog.textContent = err.data?.log || err.data?.details || err.info.message;
                    if (errorPanel) errorPanel.style.display = "block";
                } else if (err.message) {
                    showToast("Compilation Failed", err.message, "error");
                    compileLog.textContent = err.message;
                } else {
                    showToast("Compilation Failed", "An unexpected error occurred.", "error");
                    compileLog.textContent = "Recompile failed. Please check your LaTeX syntax.";
                }
            } else if (err.info) {
                showToast(err.info.title, err.info.message, err.info.type);
            }
        } finally {
            setLoading(false);
            hideLoader();
        }
    }

    function downloadPdf() {
        window.open(`${API_BASE}/api/download`, "_blank");
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
                    // Construct proper URL with API_BASE for deployed environments
                    const fetchUrl = `${API_BASE}/files/resume.pdf?v=${Date.now()}`;

                    console.log("Fetching PDF blob from:", fetchUrl);

                    // Fetch the PDF with proper error handling
                    const response = await fetch(fetchUrl, {
                        cache: "no-store",
                        headers: {
                            'Cache-Control': 'no-cache'
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
                    }

                    const pdfBlob = await response.blob();

                    // Validate the blob before upload
                    if (!pdfBlob || pdfBlob.size === 0) {
                        throw new Error("PDF blob is empty or invalid");
                    }

                    console.log(`PDF blob fetched successfully: ${pdfBlob.size} bytes, type: ${pdfBlob.type}`);

                    // Fixed filename: one PDF per user
                    const fileName = `${currentUser.id}/resume.pdf`;

                    // 1a. Explicitly remove old file to ensure clean replacement
                    const { error: removeError } = await supabase.storage
                        .from('resumes')
                        .remove([fileName]);

                    if (removeError) {
                        console.warn("Old file removal warning (might not exist):", removeError);
                    }

                    // Wait a moment to ensure removal is complete
                    await new Promise(resolve => setTimeout(resolve, 100));

                    // 1b. Upload fresh blob with proper options
                    console.log("Uploading PDF to Supabase Storage...");
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('resumes')
                        .upload(fileName, pdfBlob, {
                            contentType: 'application/pdf',
                            cacheControl: '3600', // Cache for 1 hour (not 0, as that can cause issues)
                            upsert: true
                        });

                    if (uploadError) {
                        console.error("Upload error details:", uploadError);
                        throw uploadError;
                    }

                    console.log("Upload successful:", uploadData);

                    const { data: urlData } = supabase.storage
                        .from('resumes')
                        .getPublicUrl(fileName);

                    // Add cache buster to the URL for immediate UI update
                    permanentPdfUrl = urlData.publicUrl + "?t=" + Date.now();
                    console.log("PDF stored at:", permanentPdfUrl);
                } catch (storageErr) {
                    console.error("Storage upload failed:", storageErr);
                    showToast("Upload Failed", "Could not save PDF to cloud storage. Resume not saved.", "error");
                    // Don't save to database if storage upload failed - this prevents invalid URLs
                    return;
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
                if (latexEditor) latexEditor.value = data.latex_content || "";

                // Comprehensive PDF URL validation - reject invalid/temporary URLs
                let validPdf = data.pdf_url;

                // Check for various invalid URL patterns
                const invalidPatterns = [
                    "/files/",           // Local temp files
                    "localhost",         // Localhost URLs
                    "127.0.0.1",         // Local IP
                    "vercel.app",        // Vercel preview deployments (often expire)
                    "::"                 // Vercel deployment IDs (e.g., bom1::7hdpj...)
                ];

                const isInvalidUrl = validPdf && invalidPatterns.some(pattern => validPdf.includes(pattern));

                // Only accept Supabase Storage URLs as valid
                const isSupabaseUrl = validPdf && validPdf.includes("supabase.co/storage");

                if (validPdf && (!isSupabaseUrl || isInvalidUrl)) {
                    console.warn("Ignoring invalid/expired PDF URL:", validPdf);
                    validPdf = null;
                    showToast("PDF Unavailable", "Previous PDF expired. Click Recompile to generate new.", "info");
                }

                if (validPdf) {
                    setPdfSrc(validPdf, false, false); // No force refresh on resume load
                    if (downloadBtn) downloadBtn.disabled = false;
                    setStatus("Latest version loaded", "success");
                } else {
                    // Start clean if no valid PDF - Show friendly message
                    const msg = `
                        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#64748b;font-family:system-ui,sans-serif;text-align:center;padding:20px;background:#f8fafc;">
                            <div style="font-size:48px;margin-bottom:16px;">📄</div>
                            <h3 style="margin:0 0 8px 0;color:#334155;">Preview Unavailable</h3>
                            <p style="margin:0;font-size:14px;line-height:1.5;">The previously generated PDF has expired.</p>
                            <p style="margin:4px 0 0 0;font-size:14px;font-weight:600;color:#2563eb;">Click "Recompile" to generate a new one.</p>
                        </div>
                    `;
                    setPdfSrc(msg, true);
                    setStatus("Ready to Compile", "ready");
                }

                if (recompileBtn) recompileBtn.disabled = (latexEditor && !latexEditor.value.trim());
                if (compileLog) {
                    if (!compileLog.textContent) {
                        compileLog.textContent = "Previous session loaded. Click Recompile to generate PDF.";
                    }
                    compileLog.classList.remove("has-error");
                }
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
            console.error("Supabase client not initialized. Check if initSupabase() completed successfully.");
            showToast("Connection Error", "Authentication service unavailable. Please refresh the page and try again.", "error");
            isAuthenticating = false;
            return;
        }

        const email = emailField ? emailField.value : "";
        const password = passwordField ? passwordField.value : "";
        const username = usernameField ? usernameField.value : "";

        if (authErrorMsg) authErrorMsg.style.display = "none";
        if (authMessage) authMessage.style.display = "none";
        setLoading(true);
        showLoader('Processing, please wait...');

        try {
            if (authMode === "login") {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else if (authMode === "signup") {
                if (!username || !username.trim()) throw new Error("Full Name is mandatory.");
                const { data, error } = await supabase.auth.signUp({
                    email, password, options: { data: { username } }
                });
                if (error) throw error;

                if (!data.session) {
                    if (authMessage) {
                        authMessage.textContent = "Confirmation email sent! Check " + email;
                        authMessage.style.display = "block";
                    } else {
                        showToast("Account Created", "Please check your email to verify your account.", "success");
                    }
                }
            } else if (authMode === "forgot") {
                const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
                if (error) throw error;
                if (authMessage) {
                    authMessage.textContent = "Reset link sent! Check " + email;
                    authMessage.style.display = "block";
                } else {
                    showToast("Email Sent", "Reset link sent! Check " + email, "success");
                }
            } else if (authMode === "update") {
                if (password !== (confirmPasswordField ? confirmPasswordField.value : "")) throw new Error("Passwords mismatch.");
                const { error } = await supabase.auth.updateUser({ password });
                if (error) throw error;
                showToast("Updated", "Password changed.", "success");
            }
        } catch (err) {
            console.error("Auth Exception:", err);
            if (authErrorMsg) {
                authErrorMsg.textContent = err.message;
                authErrorMsg.style.display = "block";
            } else {
                showToast("Auth Error", err.message, "error");
            }
        } finally {
            setLoading(false);
            hideLoader();
            isAuthenticating = false;
        }
    }

    async function handleLogout() {
        if (!supabase) return;

        try {
            // First, clear localStorage BEFORE attempting logout
            // This ensures session is cleared even if API call fails
            const storageKeys = Object.keys(localStorage);
            storageKeys.forEach(key => {
                if (key.startsWith('sb-')) {
                    localStorage.removeItem(key);
                }
            });

            // Attempt standard sign out
            const { error } = await supabase.auth.signOut();

            // Handle different error types
            if (error) {
                // 403 Forbidden means session already expired/invalid - this is fine
                if (error.status === 403 || error.message?.includes("403")) {
                    console.warn("Session already expired (403), local state cleared.");
                } else {
                    throw error;
                }
            } else {
                showToast("Logged Out", "See you again!", "info");
            }
        } catch (err) {
            // If session is already missing, that's fine - just clear local state
            if (err.message && (err.message.includes("Auth session missing") || err.message.includes("403"))) {
                console.warn("Session already expired, local state cleared.");
            } else {
                console.error("Logout error:", err);
                // Show error toast for unexpected issues
                showToast("Logout", "Logged out locally (session expired).", "info");
            }
        } finally {
            // ALWAYS Force UI update to ensure user is logged out locally
            currentUser = null;
            updateAuthUI(null);
            if (latexEditor) latexEditor.value = "";
            setPdfSrc(null);
            if (recompileBtn) recompileBtn.disabled = true;
            if (downloadBtn) downloadBtn.disabled = true;
            closeModal();

            // Force page reload to ensure clean state
            setTimeout(() => {
                window.location.reload();
            }, 500);
        }
    }

    function updateAuthUI(sessionData) {
        if (!supabase) return;

        // Use provided session or keep current state
        const user = sessionData?.user || currentUser;
        currentUser = user;

        // Get new dropdown elements
        const profileDropdown = $("profileDropdown");
        const profileAvatar = $("profileAvatar");
        const profileName = $("profileName");
        const profileEmail = $("profileEmail");

        if (user) {
            if (authBtn) authBtn.style.display = "none";
            if (profileDropdown) profileDropdown.style.display = "block";

            let displayName = user.user_metadata?.username ||
                user.user_metadata?.full_name ||
                user.email ||
                "User";

            if (displayName && !displayName.includes("@")) {
                displayName = displayName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
            }

            // Extract initials for avatar
            const initials = getInitials(displayName);
            if (profileAvatar) profileAvatar.textContent = initials;
            if (profileName) profileName.textContent = displayName;
            if (profileEmail) profileEmail.textContent = user.email || "";
        } else {
            if (authBtn) authBtn.style.display = "block";
            if (profileDropdown) profileDropdown.style.display = "none";
        }
    }

    // Extract initials from name
    function getInitials(name) {
        if (!name) return "U";
        const parts = name.trim().split(" ");
        if (parts.length === 1) {
            return parts[0].substring(0, 2).toUpperCase();
        }
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    // Toggle profile dropdown
    function toggleProfileDropdown() {
        const profileMenu = $("profileMenu");
        if (!profileMenu) return;
        profileMenu.classList.toggle("active");
    }

    // Close dropdown when clicking outside
    function closeProfileDropdown(event) {
        const profileDropdown = $("profileDropdown");
        const profileMenu = $("profileMenu");
        if (!profileDropdown || !profileMenu) return;

        if (!profileDropdown.contains(event.target)) {
            profileMenu.classList.remove("active");
        }
    }

    function openModal() {
        if (!authModal) return;
        setAuthUI("login");
        authModal.style.display = "block";
    }

    function closeModal() {
        if (!authModal) return;
        authModal.style.display = "none";
        if (authMessage) authMessage.style.display = "none";
        if (authErrorMsg) authErrorMsg.style.display = "none";
        if (authForm) authForm.reset();
    }


    let hasInitialized = false;
    function init() {
        if (hasInitialized) return;
        hasInitialized = true;

        // Initialize loader
        initLoader();

        // Detect standalone auth pages and set authMode
        const path = window.location.pathname;
        if (path.includes('signup.html')) {
            authMode = 'signup';
            if (usernameField) {
                usernameField.style.display = 'block';
                usernameField.required = true;
            }
        } else if (path.includes('login.html')) {
            authMode = 'login';
            if (usernameField) {
                usernameField.style.display = 'none';
                usernameField.required = false;
            }
        }

        if (statusBadge) setStatus("Ready", "ready");
        if (recompileBtn) recompileBtn.disabled = true;
        if (downloadBtn) downloadBtn.disabled = true;

        initSupabase();

        if (uploadBtn) uploadBtn.addEventListener("click", uploadPdf);
        if (recompileBtn) recompileBtn.addEventListener("click", recompileLatex);
        if (downloadBtn) downloadBtn.addEventListener("click", downloadPdf);

        // Only open modal if it's NOT a link-based auth button
        if (authBtn) {
            authBtn.addEventListener("click", (e) => {
                if (authModal && authBtn.tagName !== "A") {
                    e.preventDefault();
                    openModal();
                }
            });
        }

        if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
        if (closeBtn) closeBtn.addEventListener("click", closeModal);
        if (closeError) closeError.addEventListener("click", () => {
            if (errorPanel) errorPanel.style.display = "none";
        });
        window.addEventListener("click", (e) => {
            if (authModal && e.target === authModal) closeModal();
        });

        if (forgotBtn) forgotBtn.onclick = () => setAuthUI("forgot");
        if (authForm) authForm.addEventListener("submit", handleAuth);

        // Profile dropdown event listeners
        const profileAvatar = $("profileAvatar");
        if (profileAvatar) {
            profileAvatar.addEventListener("click", toggleProfileDropdown);
        }

        // Close dropdown when clicking outside
        document.addEventListener("click", closeProfileDropdown);

        if (pdfInput) {
            pdfInput.addEventListener("change", function () {
                if (pdfInput.files && pdfInput.files.length) {
                    setStatus("PDF selected", "ready");
                } else {
                    setStatus("Ready", "ready");
                }
            });
        }

        if (latexEditor) {
            latexEditor.addEventListener("input", function () {
                if (recompileBtn) recompileBtn.disabled = !latexEditor.value.trim();
            });
        }

        // Smooth scroll for internal anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const targetId = this.getAttribute('href');
                if (targetId && targetId.startsWith('#') && targetId.length > 1) {
                    const target = document.querySelector(targetId);
                    if (target) {
                        e.preventDefault();
                        target.scrollIntoView({ behavior: 'smooth' });
                    }
                }
            });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
