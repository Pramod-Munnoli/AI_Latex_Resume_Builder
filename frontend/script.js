
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
    const modalSubtitle = $("modalSubtitle");
    const submitBtn = $("submitBtn");
    const toggleAuth = $("toggleAuth");
    const toggleText = $("toggleText");
    const closeBtn = document.querySelector(".close");

    // CodeMirror state
    let cm = null;

    // PDF.js state
    let pdfDoc = null;
    let currentScale = 1.0;


    // Dynamic padding based on screen size
    function getPdfPadding() {
        return window.innerWidth <= 768 ? 20 : 80;
    }

    // Safely configure PDF.js if library is loaded
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

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

    let supabase = null;
    let currentUser = null;
    let isAuthenticating = false;

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
                        try {
                            // Unified state update
                            currentUser = session?.user || null;
                            updateAuthUI(session);

                            if (event === "PASSWORD_RECOVERY") {
                                // Password recovery link used
                                setAuthUI("update");
                                if (authMessage) {
                                    authMessage.textContent = "Recovery session active. Please set a new password below.";
                                    authMessage.style.display = "block";
                                }
                                openModal();
                            } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
                                if (session?.user) {
                                    // Check if this is a password recovery flow
                                    const isRecovery = window.location.hash && window.location.hash.includes("type=recovery");

                                    if (isRecovery) {
                                        // FORCE password update UI and keep modal open
                                        setAuthUI("update");
                                        if (authMessage) {
                                            authMessage.textContent = "Please set a new password to secure your account.";
                                            authMessage.style.display = "block";
                                        }
                                        openModal();
                                    } else {
                                        // Normal Login: Close modal
                                        closeModal();

                                        // Redirect to home if on standalone auth pages
                                        const path = window.location.pathname;
                                        if (path.includes("login.html") || path.includes("signup.html")) {
                                            window.location.href = "index.html";
                                        }
                                    }
                                    // Only load last AI resume if on the AI Builder page
                                    if (window.location.pathname.includes('ai-builder.html')) {
                                        loadLastSavedResume();
                                    }
                                }
                            } else if (event === "SIGNED_OUT") {
                                if (latexEditor) latexEditor.value = "";
                                setPdfSrc(null);
                                if (recompileBtn) recompileBtn.disabled = true;
                                if (downloadBtn) downloadBtn.disabled = true;
                                currentUser = null;
                                updateAuthUI(null);
                                closeModal();
                            }
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
                    });
                } catch (authClientError) {
                    console.error("Error creating Supabase client:", authClientError);
                    showToast("Authentication Error", "Failed to initialize authentication client.", "error");
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

    function setAuthUI(mode) {
        authMode = mode;
        if (authErrorMsg) authErrorMsg.style.display = "none";
        if (authMessage) authMessage.style.display = "none";
        if (submitBtn) submitBtn.style.display = "block";
        if (emailField) emailField.style.display = "block";
        const passwordGroup = $("passwordGroup");
        const fBtn = $("forgotBtn");
        const forgotHelper = fBtn ? fBtn.parentElement : null;

        if (mode === "login") {
            if (modalTitle) modalTitle.textContent = "Login";
            if (modalSubtitle) modalSubtitle.textContent = "Login to sync your resumes to the cloud.";
            if (submitBtn) submitBtn.textContent = "Login";
            if (usernameField) {
                usernameField.style.display = "none";
                usernameField.required = false;
            }
            if (passwordField) {
                passwordField.style.display = "block";
                passwordField.required = true;
            }
            if (passwordGroup) passwordGroup.style.display = "block";
            if (toggleText) {
                toggleText.style.display = "block";
                toggleText.innerHTML = "Don't have an account? <span id='toggleAuth'>Sign Up</span>";
                const tAuth = $("toggleAuth");
                if (tAuth) tAuth.onclick = () => setAuthUI("signup");
            }
            if (backToLogin) backToLogin.style.display = "none";
            if (fBtn) fBtn.style.display = "inline";
            if (forgotHelper) forgotHelper.style.display = "block";
        } else if (mode === "signup") {
            if (modalTitle) modalTitle.textContent = "Sign Up";
            if (modalSubtitle) modalSubtitle.textContent = "Start building professional resumes for free.";
            if (submitBtn) submitBtn.textContent = "Create Account";
            if (usernameField) {
                usernameField.style.display = "block";
                usernameField.required = true;
            }
            if (passwordField) {
                passwordField.style.display = "block";
                passwordField.required = true;
            }
            if (passwordGroup) passwordGroup.style.display = "block";
            if (toggleText) {
                toggleText.style.display = "block";
                toggleText.innerHTML = "Already have an account? <span id='toggleAuth'>Login</span>";
                const tAuth = $("toggleAuth");
                if (tAuth) tAuth.onclick = () => setAuthUI("login");
            }
            if (backToLogin) backToLogin.style.display = "none";
            if (fBtn) fBtn.style.display = "none";
            if (forgotHelper) forgotHelper.style.display = "none";
        } else if (mode === "forgot") {
            if (modalTitle) modalTitle.textContent = "Reset Password";
            if (modalSubtitle) modalSubtitle.textContent = "Enter your email to receive a password reset link.";
            if (submitBtn) submitBtn.textContent = "Send Reset Link";
            if (usernameField) {
                usernameField.style.display = "none";
                usernameField.required = false;
            }
            if (passwordField) {
                passwordField.style.display = "none";
                passwordField.required = false;
            }
            if (passwordGroup) passwordGroup.style.display = "none";
            if (toggleText) toggleText.style.display = "none";
            if (backToLogin) {
                backToLogin.style.display = "block";
                const bBtn = $("backBtn");
                if (bBtn) bBtn.onclick = () => setAuthUI("login");
            }
            if (fBtn) fBtn.style.display = "none";
            if (forgotHelper) forgotHelper.style.display = "none";
        } else if (mode === "update") {
            if (modalTitle) modalTitle.textContent = "Update Password";
            if (modalSubtitle) modalSubtitle.textContent = "Please set a new password for your account.";
            if (submitBtn) submitBtn.textContent = "Save New Password";
            if (usernameField) {
                usernameField.style.display = "none";
                usernameField.required = false;
            }
            if (emailField) {
                emailField.style.display = "none";
                emailField.required = false;
            }
            if (passwordGroup) passwordGroup.style.display = "block";
            if (passwordField) {
                passwordField.style.display = "block";
                passwordField.required = true;
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
        if (recompileBtn) recompileBtn.disabled = isLoading || (cm && !cm.getValue().trim());
        if (downloadBtn) downloadBtn.disabled = isLoading;
    }

    // --- CODEMIRROR HELPERS ---
    function initCodeMirror() {
        if (!latexEditor) return;

        cm = CodeMirror.fromTextArea(latexEditor, {
            mode: "stex",
            theme: "dracula",
            lineNumbers: true,
            lineWrapping: true,
            tabSize: 4,
            indentUnit: 4,
            viewportMargin: Infinity
        });

        cm.on('change', () => {
            if (recompileBtn) {
                recompileBtn.disabled = !cm.getValue().trim();
            }
        });

        cm.setSize("100%", "100%");

        // Ensure refresh after initial render
        setTimeout(() => {
            if (cm) cm.refresh();
        }, 100);
    }

    function setEditorValue(val) {
        if (cm) cm.setValue(val || "");
        else if (latexEditor) latexEditor.value = val || "";
    }

    function getEditorValue() {
        return cm ? cm.getValue() : (latexEditor ? latexEditor.value : "");
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


    // --- PDF.js VIEWER LOGIC ---
    let currentRenderId = 0;

    async function setPdfSrc(url, isHtml = false, forceRefresh = false) {
        if (isHtml) {
            // Re-implement if HTML fallback is needed for text messages, 
            // but usually we just want to show a message in the viewer.
            console.warn("setPdfSrc isHtml=true not supported in PDF.js mode");
            return;
        }

        if (!url) return;
        let fullUrl = url;
        if (url.startsWith("/files/")) {
            fullUrl = API_BASE + url;
        }

        const separator = fullUrl.includes('?') ? '&' : '?';
        const fetchUrl = forceRefresh ? `${fullUrl}${separator}t=${Date.now()}` : fullUrl;

        await loadPDF(fetchUrl);
    }

    async function loadPDF(url) {
        const loader = document.getElementById('pdfPreviewLoader');
        const status = document.getElementById('pdfLoaderStatus');
        if (loader) loader.style.display = 'flex';
        if (status) status.textContent = 'Loading Document...';

        try {
            const loadingTask = pdfjsLib.getDocument(url);
            pdfDoc = await loadingTask.promise;

            if (status) status.textContent = 'Rendering Pages...';
            const pageCountEl = document.getElementById('pageCount');
            const pageNumEl = document.getElementById('pageNum');
            if (pageCountEl) pageCountEl.textContent = pdfDoc.numPages;
            if (pageNumEl) pageNumEl.textContent = 1;

            await renderAllPages();
            fitToWidth();

        } catch (err) {
            console.error('Error loading PDF:', err);
        } finally {
            if (loader) loader.style.display = 'none';
        }
    }

    async function renderAllPages() {
        const renderId = ++currentRenderId;
        const container = document.getElementById('pdfCanvasContainer');
        if (!container || !pdfDoc) return;

        container.innerHTML = '';

        for (let i = 1; i <= pdfDoc.numPages; i++) {
            // If a new render has started, abort this one
            if (renderId !== currentRenderId) return;

            const page = await pdfDoc.getPage(i);
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page-canvas';
            container.appendChild(canvas);

            const viewport = page.getViewport({ scale: 2.0 });
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
        }
    }

    function updateVisualScale() {
        const container = document.getElementById('pdfCanvasContainer');
        const zoomValue = document.getElementById('zoomValue');
        if (!container) return;

        const visualScale = currentScale / 2.0;
        container.style.transform = `scale(${visualScale})`;
        if (zoomValue) zoomValue.textContent = Math.round(currentScale * 100) + '%';
    }

    function fitToWidth() {
        if (!pdfDoc) return;
        const viewer = document.getElementById('pdfViewer');
        if (!viewer) return;

        pdfDoc.getPage(1).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            const padding = getPdfPadding();
            const availableWidth = viewer.clientWidth - padding;
            currentScale = availableWidth / viewport.width;
            updateVisualScale();
        });
    }

    function fitToPage() {
        if (!pdfDoc) return;
        const viewer = document.getElementById('pdfViewer');
        if (!viewer) return;

        pdfDoc.getPage(1).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            const padding = getPdfPadding();
            const availableHeight = viewer.clientHeight - padding;
            currentScale = availableHeight / viewport.height;
            updateVisualScale();
        });
    }

    function setupToolbarFeatures() {
        const zoomIn = document.getElementById('zoomIn');
        const zoomOut = document.getElementById('zoomOut');
        const fitWidthBtn = document.getElementById('fitWidthBtn');
        const fitPageBtn = document.getElementById('fitPageBtn');
        const pdfViewer = document.getElementById('pdfViewer');
        const toggleTheme = document.getElementById('toggleTheme');

        if (zoomIn) zoomIn.onclick = () => { currentScale = Math.min(currentScale + 0.1, 3.0); updateVisualScale(); };
        if (zoomOut) zoomOut.onclick = () => { currentScale = Math.max(currentScale - 0.1, 0.4); updateVisualScale(); };
        if (fitWidthBtn) fitWidthBtn.onclick = fitToWidth;
        if (fitPageBtn) fitPageBtn.onclick = fitToPage;

        if (toggleTheme) {
            toggleTheme.onclick = () => {
                const container = document.getElementById('pdfCanvasContainer');
                if (container) container.classList.toggle('pdf-dark-mode');
            };
        }

        const prevPage = document.getElementById('prevPage');
        const nextPage = document.getElementById('nextPage');
        const pageNum = document.getElementById('pageNum');

        if (prevPage) {
            prevPage.onclick = () => {
                const current = parseInt(pageNum.textContent);
                if (current > 1) scrollToPage(current - 1);
            };
        }
        if (nextPage) {
            nextPage.onclick = () => {
                const current = parseInt(pageNum.textContent);
                const totalText = document.getElementById('pageCount')?.textContent;
                const total = parseInt(totalText) || 1;
                if (current < total) scrollToPage(current + 1);
            };
        }

        function scrollToPage(num) {
            const container = document.getElementById('pdfCanvasContainer');
            const canvases = container.querySelectorAll('.pdf-page-canvas');
            if (canvases[num - 1]) {
                canvases[num - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (pageNum) pageNum.textContent = num;
            }
        }

        if (pdfViewer) {
            pdfViewer.addEventListener('scroll', () => {
                const canvases = pdfViewer.querySelectorAll('.pdf-page-canvas');
                const viewerRect = pdfViewer.getBoundingClientRect();
                canvases.forEach((canvas, index) => {
                    const rect = canvas.getBoundingClientRect();
                    if (rect.top < viewerRect.bottom && rect.bottom > viewerRect.top) {
                        if (rect.top < viewerRect.top + viewerRect.height / 2 && pageNum) {
                            pageNum.textContent = index + 1;
                        }
                    }
                });
            });

            pdfViewer.addEventListener('wheel', (e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? -0.1 : 0.1;
                    const oldScale = currentScale;
                    currentScale = Math.min(Math.max(currentScale + delta, 0.4), 3.0);
                    const rect = pdfViewer.getBoundingClientRect();
                    const ratio = currentScale / oldScale;
                    updateVisualScale();
                    pdfViewer.scrollLeft = (pdfViewer.scrollLeft + (e.clientX - rect.left)) * ratio - (e.clientX - rect.left);
                    pdfViewer.scrollTop = (pdfViewer.scrollTop + (e.clientY - rect.top)) * ratio - (e.clientY - rect.top);
                }
            }, { passive: false });

            let isPanning = false, startX, startY, sL, sT;
            pdfViewer.addEventListener('mousedown', (e) => {
                if (e.button === 0) {
                    isPanning = true;
                    pdfViewer.classList.add('grabbing');
                    pdfViewer.classList.remove('grab');
                    startX = e.clientX; startY = e.clientY; sL = pdfViewer.scrollLeft; sT = pdfViewer.scrollTop;
                }
            });
            document.addEventListener('mousemove', (e) => {
                if (!isPanning) return;
                pdfViewer.scrollLeft = sL - (e.clientX - startX);
                pdfViewer.scrollTop = sT - (e.clientY - startY);
            });
            document.addEventListener('mouseup', () => {
                if (isPanning) {
                    isPanning = false;
                    pdfViewer.classList.remove('grabbing');
                    pdfViewer.classList.add('grab');
                }
            });
        }
    }

    function setupResizer() {
        const resizer = document.getElementById('resizer');
        const leftPanel = document.querySelector('.editor-panel');
        const container = document.querySelector('.editor-container');
        if (!resizer || !leftPanel || !container) return;

        let isResizing = false;
        resizer.addEventListener('mousedown', () => {
            isResizing = true;
            document.body.style.cursor = 'col-resize';
            container.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const rect = container.getBoundingClientRect();
            const width = Math.min(Math.max(e.clientX - rect.left, rect.width * 0.2), rect.width * 0.8);
            leftPanel.style.width = `${width}px`;
            leftPanel.style.flex = 'none';
            if (cm) cm.refresh();
            fitToWidth();
        });
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false; document.body.style.cursor = ''; container.style.userSelect = '';
                if (cm) cm.refresh();
            }
        });
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
        // Redirect if not logged in
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }

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

            if (latexEditor) setEditorValue((data.latex || "").trim());
            setPdfSrc(data.pdfUrl || "/files/resume.pdf", false, true);

            setStatus("Compiled successfully", "success");
            showToast("Success!", "Resume generated successfully.", "success");

            if (recompileBtn) recompileBtn.disabled = (cm && !cm.getValue().trim());
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
        // Redirect if not logged in
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }

        const latex = getEditorValue();
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

            // Save updated version to Database ONLY if logged in and on the AI Builder page
            // We do NOT save template experiments from the Editor to the primary "My Resume" slot
            if (currentUser && window.location.pathname.includes('ai-builder.html')) {
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
                if (latexEditor) setEditorValue(data.latex_content || "");

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
                    // Start clean if no valid PDF
                    setStatus("Ready to Compile", "ready");
                }

                if (recompileBtn) recompileBtn.disabled = (cm && !cm.getValue().trim());
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

        const email = emailField ? emailField.value.trim().toLowerCase() : "";
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
                // 1. Check if email is registered in our public tracking table
                const { data: emailData, error: checkError } = await supabase
                    .from('user_emails')
                    .select('email')
                    .eq('email', email)
                    .maybeSingle();

                if (checkError) {
                    if (checkError.message.includes("relation \"user_emails\" does not exist")) {
                        throw new Error("Registration check is being configured. Please contact admin to run the database setup.");
                    }
                    console.warn("Registration check warning:", checkError);
                }

                if (!emailData) {
                    throw new Error("This email is not registered with us. Please sign up first.");
                }

                // 2. Only if registered, send reset email link
                const currentUrl = window.location.href.split('#')[0];
                const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: currentUrl });

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

                // Clear recovery hash after success
                if (window.location.hash.includes("type=recovery")) {
                    window.history.replaceState(null, null, window.location.pathname);
                }

                showToast("Updated", "Password changed successfully.", "success");
                closeModal();
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

    function toggleProfileDropdown() {
        const profileMenu = $("profileMenu");
        if (!profileMenu) return;
        profileMenu.classList.toggle("active");
    }

    // Toggle Mobile Menu
    function toggleMobileMenu() {
        const btn = document.getElementById('mobileMenuBtn');
        const overlay = document.getElementById('mobileNavOverlay');

        if (btn && overlay) {
            btn.classList.toggle('active');
            overlay.classList.toggle('active');

            // Prevent body scroll when menu is open
            if (overlay.classList.contains('active')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        }
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

    // Password Visibility Toggle
    function setupPasswordToggle() {
        const toggleBtn = $("toggleVisibility");
        const passwordInput = $("password");

        if (!toggleBtn || !passwordInput) return;

        toggleBtn.addEventListener("click", () => {
            const isPassword = passwordInput.type === "password";
            passwordInput.type = isPassword ? "text" : "password";

            const icon = toggleBtn.querySelector("i");
            if (icon && window.lucide) {
                icon.setAttribute("data-lucide", isPassword ? "eye-off" : "eye");
                lucide.createIcons();
            }
        });
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

        // Setup password visibility toggle
        setupPasswordToggle();

        if (statusBadge) setStatus("Ready", "ready");
        if (recompileBtn) recompileBtn.disabled = true;
        if (downloadBtn) downloadBtn.disabled = true;

        initSupabase();

        // Handle template loading for Editor page
        if (window.location.pathname.includes('editor.html')) {
            const urlParams = new URLSearchParams(window.location.search);
            const templateId = urlParams.get('template');

            if (templateId && window.TEMPLATES_DATA && window.TEMPLATES_DATA[templateId]) {
                if (latexEditor) {
                    latexEditor.value = window.TEMPLATES_DATA[templateId];
                    // Trigger recompile automatically for templates if possible, or just enable button
                    if (recompileBtn) recompileBtn.disabled = false;

                    // Show a helpful message in the log
                    if (compileLog) compileLog.textContent = `Loaded ${templateId.replace(/-/g, ' ')} template. Click Recompile to generate PDF.`;
                }
            } else {
                // If no template and no AI code, show default
                if (latexEditor && !latexEditor.value.trim()) {
                    latexEditor.value = `\\documentclass{article}\n\\begin{document}\nHello World!\n\\end{document}`;
                }
            }
        } else if (window.location.pathname.includes('ai-builder.html')) {
            // AI Builder specific initialization
            initCodeMirror();
            setupToolbarFeatures();
            setupResizer();
            if (uploadBtn) uploadBtn.addEventListener("click", uploadPdf);
        }
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

        // Mobile Menu Logic
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', toggleMobileMenu);
        }

        if (pdfInput) {
            pdfInput.addEventListener("change", function () {
                if (pdfInput.files && pdfInput.files.length) {
                    const file = pdfInput.files[0];
                    // Update UI with filename
                    const fileNameDisplay = document.getElementById('selectedFileName');
                    if (fileNameDisplay) {
                        fileNameDisplay.textContent = `Selected: ${file.name}`;
                        fileNameDisplay.style.display = 'inline-block';
                    }
                    setStatus("PDF selected", "ready");
                } else {
                    setStatus("Ready", "ready");
                }
            });
        }

        // Drag and Drop Implementation
        const dropZone = document.getElementById('dropZone');
        if (dropZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, preventDefaults, false);
            });

            function preventDefaults(e) {
                e.preventDefault();
                e.stopPropagation();
            }

            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, highlight, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, unhighlight, false);
            });

            function highlight(e) {
                dropZone.classList.add('drag-over');
            }

            function unhighlight(e) {
                dropZone.classList.remove('drag-over');
            }

            dropZone.addEventListener('drop', handleDrop, false);

            function handleDrop(e) {
                const dt = e.dataTransfer;
                const files = dt.files;

                if (files.length > 0) {
                    const file = files[0];
                    if (file.type !== 'application/pdf') {
                        showToast("Invalid File", "Please upload a PDF file.", "error");
                        return;
                    }

                    // Manually assign to input
                    if (pdfInput) {
                        // Modern browsers allow assigning a DataTransfer reference
                        pdfInput.files = files;
                        // Trigger change event manually
                        const event = new Event('change', { bubbles: true });
                        pdfInput.dispatchEvent(event);
                    }
                }
            }
        }

        if (latexEditor) {
            latexEditor.addEventListener("input", function () {
                if (recompileBtn) recompileBtn.disabled = !getEditorValue().trim();
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

        // Mobile View Toggle Logic
        const mobileToggleContainer = document.querySelector('.mobile-view-toggle');
        if (mobileToggleContainer) {
            const editorBtn = document.getElementById('mobileShowEditor');
            const previewBtn = document.getElementById('mobileShowPreview');
            const editorPanel = document.querySelector('.editor-panel');
            const previewPanel = document.querySelector('.preview-panel');

            function switchToEditor() {
                if (editorBtn) editorBtn.classList.add('active');
                if (previewBtn) previewBtn.classList.remove('active');
                if (editorPanel) editorPanel.classList.add('mobile-active');
                if (previewPanel) previewPanel.classList.remove('mobile-active');
                if (cm) cm.refresh();
            }

            function switchToPreview() {
                if (editorBtn) editorBtn.classList.remove('active');
                if (previewBtn) previewBtn.classList.add('active');
                if (editorPanel) editorPanel.classList.remove('mobile-active');
                if (previewPanel) previewPanel.classList.add('mobile-active');
                // Trigger resize for PDF viewer
                window.dispatchEvent(new Event('resize'));
            }

            if (editorBtn) editorBtn.addEventListener('click', switchToEditor);
            if (previewBtn) previewBtn.addEventListener('click', switchToPreview);

            // Initial State default to Editor
            if (window.innerWidth <= 768) {
                switchToEditor();
            }
        }
    }

    // Global Resize Handler for PDF Viewer
    window.addEventListener('resize', () => {
        if (pdfDoc && document.getElementById('pdfViewer')) {
            fitToWidth();
        }
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
