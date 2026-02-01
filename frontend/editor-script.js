/**
 * Editor Page Logic - Template Loading, Change Tracking, and Save
 * This script handles the editor.html page specifically for template editing
 */

(function () {
    "use strict";

    // --- THEME MANAGEMENT ---
    // This is essential since editor.html doesn't load script.js which has applyTheme()
    const THEME_KEY = "ai_resume_theme";
    function applyTheme() {
        const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
    window.toggleGlobalTheme = function (isDark) {
        const newTheme = isDark ? 'dark' : 'light';
        localStorage.setItem(THEME_KEY, newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };
    applyTheme(); // Apply theme IMMEDIATELY on script load

    // API Base URL
    const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? (window.location.port === "3000" ? "" : "http://localhost:3000")
        : "https://ai-latex-resume-builder.onrender.com";

    function $(id) { return document.getElementById(id); }

    // DOM Elements
    const latexEditor = $("latexEditor");
    const recompileBtn = $("recompileBtn");
    const downloadBtn = $("downloadBtn");
    const compileLog = $("compileLog");
    const pdfFrame = $("pdfFrame");
    const statusBadge = $("statusBadge");

    // State variables
    let currentTemplateId = null;
    let currentTemplateName = null;
    let originalLatexCode = "";
    let hasChanges = false;
    let currentUser = null;
    let supabase = null;
    let cm = null;
    let currentTemplateSource = null; // 'user' or 'default'
    let userHasCustomVersion = false; // Track if user has saved this template
    let isCompiling = false; // Flag to prevent multiple simultaneous compilations
    let lastCompiledPdfUrl = null; // Track the current PDF URL

    // Loader elements
    let appLoader = null;
    let loaderMessageEl = null;



    /**
     * Get the database column name for a template
     * @param {string} templateName - Template name (e.g., 'ats-modern')
     * @returns {string} Column name (e.g., 'ats_template_latex')
     */
    function getTemplateColumn(templateName) {
        const mapping = window.TEMPLATE_COLUMN_MAPPING || {
            'ats-modern': 'ats_template_latex',
            'clean-minimalist': 'minimal_template_latex',
            'academic-excellence': 'academic_template_latex',
            'tech-focused': 'developer_template_latex',
            'student': 'student_template_latex'
        };
        return mapping[templateName];
    }

    // Initialize CodeMirror with theme awareness
    function initCodeMirror() {
        if (!latexEditor) return;

        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const cmTheme = currentTheme === 'light' ? 'default' : 'dracula';

        cm = CodeMirror.fromTextArea(latexEditor, {
            mode: "stex",
            theme: cmTheme,
            lineNumbers: true,
            lineWrapping: true,
            tabSize: 4,
            indentUnit: 4,
            viewportMargin: Infinity
        });

        cm.on('change', () => {
            const currentCode = cm.getValue();
            hasChanges = currentCode !== originalLatexCode;

            // Update recompile button state
            if (recompileBtn) {
                recompileBtn.disabled = !currentCode.trim();
            }
        });

        // Set initial size
        cm.setSize("100%", "100%");
        originalLatexCode = cm.getValue();
        hasChanges = false;

        // Listen for global theme changes to update CodeMirror
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme') {
                    const newTheme = document.documentElement.getAttribute('data-theme');
                    if (cm) cm.setOption('theme', newTheme === 'light' ? 'default' : 'dracula');
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });
    }








    // Initialize Supabase
    async function initSupabase() {
        // console.log('[Init] API_BASE:', API_BASE);
        try {
            const configUrl = `${API_BASE}/api/config`.replace(/([^:])\/\//g, '$1/');
            // console.log('[Init] Fetching config from:', configUrl);
            const resp = await fetch(configUrl);

            if (!resp.ok) {
                console.error(`[Init] Config failed: ${resp.status}`);
                throw new Error(`Server responded with ${resp.status}`);
            }

            const config = await resp.json();
            if (config.supabaseUrl && config.supabaseAnonKey) {
                supabase = window.supabase.createClient(
                    config.supabaseUrl.trim(),
                    config.supabaseAnonKey.trim()
                );

                // Listen for auth state changes
                supabase.auth.onAuthStateChange(async (event, session) => {
                    currentUser = session?.user || null;
                });

                // Get current session
                const { data: { session } } = await supabase.auth.getSession();
                currentUser = session?.user || null;
                // console.log('[Init] Supabase set up. User:', currentUser ? currentUser.email : 'Guest');
            }
        } catch (err) {
            console.warn('[Init] Supabase initialization failed: ' + err.message);
            supabase = null; // Trigger fallbacks
        }
    }

    // Parse URL parameters
    function getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            template: params.get('template') || params.get('templateName'),
            templateId: params.get('templateId'),
            templateName: params.get('templateName')
        };
    }

    async function loadTemplate() {
        try {
            showLoader('Fetching template code...');

            // Show skeleton instead
            toggleSkeleton(true);

            setStatus('Loading template...', 'info');

            // Get template name from URL
            const params = getUrlParams();
            currentTemplateName = params.template || params.templateName;

            if (!currentTemplateName) {
                // ... (keep overlay handling)
                // Show overlays
                const noTemplateOverlay = document.getElementById('no-template-overlay');
                const noPreviewPlaceholder = document.getElementById('no-preview-placeholder');

                if (noTemplateOverlay) noTemplateOverlay.style.display = 'flex';
                if (noPreviewPlaceholder) noPreviewPlaceholder.style.display = 'flex';

                // Re-init icons to ensure overlays look good
                if (window.lucide) window.lucide.createIcons();

                setStatus('Please select a template from the templates page', 'info');
                if (cm) cm.setValue('% Please select a template from the templates page to start editing.');
                toggleSkeleton(false);
                hideLoader();
                return;
            } else {
                // Hide overlays if we have a template name
                const noTemplateOverlay = document.getElementById('no-template-overlay');
                const noPreviewPlaceholder = document.getElementById('no-preview-placeholder');
                if (noTemplateOverlay) noTemplateOverlay.style.display = 'none';
                if (noPreviewPlaceholder) noPreviewPlaceholder.style.display = 'none';
            }

            const isAIResume = (currentTemplateName === 'ai' || currentTemplateName === 'ai-resume');
            let latexCode = null;
            let isUserVersion = false;

            // Fetch user info first (safely)
            let user = null;
            if (supabase) {
                const { data } = await supabase.auth.getUser();
                user = data?.user;
            }
            currentUser = user;

            // 1. Handle special AI Resume case
            if (isAIResume) {
                if (user) {
                    const { data: aiData, error: aiError } = await supabase
                        .from('resumes')
                        .select('latex_content, pdf_url')
                        .eq('user_id', user.id)
                        .eq('title', 'AI Generated Resume')
                        .maybeSingle();

                    if (!aiError && aiData && aiData.latex_content) {
                        latexCode = aiData.latex_content;
                        lastCompiledPdfUrl = aiData.pdf_url;
                        isUserVersion = true;
                        userHasCustomVersion = false;
                        currentTemplateSource = 'ai';
                        currentTemplateId = 'ai';

                        const copyLinkBtn = document.getElementById('copyLinkBtn');
                        if (copyLinkBtn) copyLinkBtn.style.display = 'flex';
                    } else {
                        throw new Error('No AI-generated resume found. Please create one in the AI Builder.');
                    }
                } else {
                    window.location.href = 'login.html';
                    return;
                }
            } else {
                // 2. Try to fetch user's custom version if logged in
                if (user) {
                    const columnName = getTemplateColumn(currentTemplateName);
                    if (columnName) {
                        const { data: userTemplate, error: userError } = await supabase
                            .from('user_resumes')
                            .select(columnName)
                            .eq('user_id', user.id)
                            .maybeSingle();

                        if (!userError && userTemplate && userTemplate[columnName]) {
                            latexCode = userTemplate[columnName];
                            isUserVersion = true;
                            userHasCustomVersion = true;
                            currentTemplateSource = 'user';
                        }
                    }
                }

                // 3. Fallback to default template from back-end API (more reliable)
                if (!latexCode) {
                    const templateId = params.templateId;
                    const fetchUrl = templateId
                        ? `${API_BASE}/api/templates/${templateId}`
                        : `${API_BASE}/api/templates/by-name/${currentTemplateName}`;

                    const cleanFetchUrl = fetchUrl.replace(/([^:])\/\//g, '$1/');
                    // console.log('[Load] Fetching template from:', cleanFetchUrl);

                    const resp = await fetch(cleanFetchUrl);
                    if (!resp.ok) {
                        throw new Error(`Failed to load template from API: ${resp.status}`);
                    }

                    const data = await resp.json();
                    const templateData = data.template;

                    if (!templateData || !templateData.latex_code) {
                        throw new Error('Template data is empty or missing');
                    }

                    latexCode = templateData.latex_code;
                    currentTemplateSource = 'default';
                }
            }

            // 3. IMMEDIATELY populate editor and hide global loader
            // This makes the app feel much faster as the user can start editing right away
            if (cm) {
                cm.setValue(latexCode);
                originalLatexCode = latexCode;
                hasChanges = false;
            }

            // Update UI elements
            updateTemplateNameDisplay();
            updateVersionButtons();

            // HIDE THE FULL SCREEN LOADER NOW
            // The user can now see and edit the code
            hideLoader();

            // 4. Start compilation in background (PDF panel will show its own loader)
            // No 'await' here so the function finishes and lets the UI be interactive
            compileLatex(latexCode).then(() => {
                setStatus('Template loaded and compiled', 'success');
            }).catch(err => {
                console.error('Initial background compilation failed:', err);
                // setStatus will be called by compileLatex logic
            });

        } catch (error) {
            console.error('Error loading template:', error);
            // Hide loader first
            hideLoader();

            // Suppress error status for expected guest behavior or provide friendlier message
            if (error.message.includes("Connection to database failed") || error.message.includes("null") || error.message.includes("'auth'")) {
                setStatus('Loaded in guest mode', 'warning');
            } else {
                setStatus('Error: ' + error.message, 'error');
            }
        }
    }

    /**
     * Initialize app loader references
     */
    function initLoader() {
        appLoader = document.getElementById('appLoader');
        loaderMessageEl = document.getElementById('appLoaderMessage');
    }

    /**
     * Show global app loader
     */
    function showLoader(message = 'Processing, please wait...') {
        if (!appLoader) initLoader();
        if (!appLoader) return;

        if (loaderMessageEl) loaderMessageEl.textContent = message;
        appLoader.classList.add('active');
        document.body.classList.add('lock-scroll');
        document.body.style.setProperty('overflow', 'hidden', 'important');
        document.body.style.setProperty('overflow-y', 'hidden', 'important');
    }

    /**
     * Hide global app loader
     */
    function hideLoader() {
        if (!appLoader) initLoader();
        if (!appLoader) return;

        appLoader.classList.remove('active');
        document.body.classList.remove('lock-scroll');
        document.body.style.overflow = '';
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('overflow-y');
    }

    const SKELETON_PAGE_HTML = `
        <div class="skeleton-container">
            <div class="skeleton-shimmer"></div>
            <!-- Header Group -->
            <div class="skeleton-top-group">
                <div class="skeleton-header"></div>
                <div class="skeleton-subheader"></div>
            </div>
            <!-- Section 1 -->
            <div class="skeleton-block">
                <div class="skeleton-section-title"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line mid"></div>
                <div class="skeleton-line short"></div>
            </div>
            <!-- Section 2 -->
            <div class="skeleton-block">
                <div class="skeleton-section-title"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line mid"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
            </div>
            <!-- Section 3 -->
            <div class="skeleton-block">
                <div class="skeleton-section-title"></div>
                <div class="skeleton-line mid"></div>
                <div class="skeleton-line short"></div>
            </div>
        </div>
    `;

    /**
     * Show/Hide PDF Preview Skeleton and manage body overflow
     * @param {boolean} show - Whether to show the skeleton
     */
    function toggleSkeleton(show) {
        const skeletonLoader = document.getElementById('pdfPreviewLoader');
        const noPreviewPlaceholder = document.getElementById('no-preview-placeholder');
        if (!skeletonLoader) return;

        if (show) {
            // Hide placeholder if showing skeleton
            if (noPreviewPlaceholder) noPreviewPlaceholder.style.display = 'none';

            // Determine how many pages to show (default 1)
            let numPages = 1;
            if (pdfDoc && pdfDoc.numPages) {
                numPages = pdfDoc.numPages;
            }

            // Populate skeleton pages
            skeletonLoader.innerHTML = Array(numPages).fill(SKELETON_PAGE_HTML).join('');

            skeletonLoader.style.display = 'flex';

            // Re-calculate view height for skeletons
            updateVisualScale();
        } else {
            skeletonLoader.style.display = 'none';
        }
    }

    // Focus/restore listener
    window.addEventListener('focus', () => {
        // Scroll lock is now handled individually by global loaders only
    });

    // Compile LaTeX code
    async function compileLatex(latex) {
        if (isCompiling) return;
        isCompiling = true;

        const status = document.getElementById('pdfLoaderStatus');

        toggleSkeleton(true);
        if (status) status.textContent = 'Compiling LaTeX...';

        try {
            const { data: { session } } = window._supabase ? await window._supabase.auth.getSession() : { data: { session: null } };
            const headers = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const isAI = (currentTemplateName === 'ai' || currentTemplateName === 'ai-resume');
            const type = isAI ? 'ai' : 'template';
            const title = isAI ? 'AI Generated Resume' : (currentTemplateName || 'Resume');

            const response = await fetch(`${API_BASE}/api/recompile`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ latex, type, title })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.details || 'Compilation failed');
            }

            if (status) status.textContent = 'Rendering PDF...';

            lastCompiledPdfUrl = data.pdfUrl;

            // Update PDF preview using the new PDF.js engine
            await setPdfSrc(data.pdfUrl || "/files/resume.pdf");

            if (compileLog) {
                compileLog.textContent = data.log || "Compilation successful.";
                compileLog.classList.remove("has-error");
            }

            if (downloadBtn && data.pdfUrl) {
                downloadBtn.disabled = false;
                downloadBtn.onclick = (e) => {
                    e.preventDefault();
                    window.open(data.pdfUrl, "_blank");
                };
            }

            return data; // Return data for handleRecompile to use

        } catch (err) {
            console.error('Compilation error:', err);
            if (compileLog) {
                compileLog.textContent = err.message;
                compileLog.classList.add("has-error");
            }
            throw err;
        } finally {
            // loader hidden in setPdfSrc -> loadPDF or here if failed
            toggleSkeleton(false);
            isCompiling = false;
        }
    }

    /**
     * Handle recompile button click
     * Requires authentication and saves to database
     */
    async function handleRecompile() {
        if (isCompiling) {
            setStatus('Please wait for the current compilation to finish', 'info');
            return;
        }



        // Always allow recompilation 
        const currentLatex = cm.getValue();
        if (!currentLatex.trim()) {
            setStatus('Editor is empty!', 'error');
            return;
        }

        try {
            // 1. Check authentication (Only if Supabase is available)
            let user = null;
            if (supabase) {
                const { data } = await supabase.auth.getUser();
                user = data?.user;
            } else {
                console.warn("Supabase client not initialized. Proceeding as guest.");
            }
            currentUser = user;

            if (!user) {
                // Redirect immediately if not logged in
                window.location.href = 'login.html';
                return;
            }

            // 2. Show loading state on button
            if (recompileBtn) {
                recompileBtn.classList.add('loading');
                recompileBtn.disabled = true;
            }

            setStatus('Recompiling and saving...', 'info');

            // 3. Save to database using atomic upserts
            // This reduces network round-trips and prevents race conditions
            if (currentTemplateName === 'ai' || currentTemplateName === 'ai-resume') {
                const versionedPdfUrl = lastCompiledPdfUrl ? (lastCompiledPdfUrl.includes('?') ? lastCompiledPdfUrl : `${lastCompiledPdfUrl}?v=${Date.now()}`) : null;

                const { error: aiError } = await supabase
                    .from('resumes')
                    .upsert({
                        user_id: user.id,
                        title: 'AI Generated Resume',
                        latex_content: currentLatex,
                        pdf_url: versionedPdfUrl,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id,title' });

                if (aiError) throw aiError;
            } else {
                // console.log("Template saved to user_resumes");
                const columnName = getTemplateColumn(currentTemplateName);
                if (!columnName) throw new Error('Invalid template column mapping');

                const { error: saveError } = await supabase
                    .from('user_resumes')
                    .upsert({
                        user_id: user.id,
                        [columnName]: currentLatex,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' });

                if (saveError) throw saveError;
            }

            // Update state - user now has custom version
            userHasCustomVersion = true;
            currentTemplateSource = 'user';
            updateVersionButtons();
            originalLatexCode = currentLatex;
            hasChanges = false;

            // 4. Compile to PDF
            await compileLatex(currentLatex);
            setStatus('Saved and compiled successfully!', 'success');

        } catch (error) {
            console.error('Error recompiling:', error);
            setStatus('Error: ' + error.message, 'error');
        } finally {
            // Remove loading state from button
            if (recompileBtn) {
                recompileBtn.classList.remove('loading');
                recompileBtn.disabled = false;
            }
        }
    }

    /**
     * Update version control buttons visibility
     */
    function updateVersionButtons() {
        const container = document.querySelector('.template-version-controls');
        const loadUserBtn = document.getElementById('load-user-version-btn');
        const loadOriginalBtn = document.getElementById('load-original-btn');

        if (!container || !loadUserBtn || !loadOriginalBtn) return;

        // Show container only if user is logged in and has custom version
        if (currentUser && userHasCustomVersion) {
            container.style.display = 'flex';

            // Show "My Version" button only if currently viewing default
            if (currentTemplateSource === 'default') {
                loadUserBtn.style.display = 'flex';
                loadOriginalBtn.style.display = 'none';
            }
            // Show "Original" button only if currently viewing user version
            else if (currentTemplateSource === 'user') {
                loadUserBtn.style.display = 'none';
                loadOriginalBtn.style.display = 'flex';
            }
        } else {
            container.style.display = 'none';
        }
    }

    /**
     * Load user's saved version of the template
     */
    async function handleLoadUserVersion() {
        try {
            // Remove global loader
            showLoader('Loading your saved version...');
            setStatus('Loading your saved version...', 'info');

            // Show skeleton instead
            toggleSkeleton(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const columnName = getTemplateColumn(currentTemplateName);

            const { data: userTemplate, error } = await supabase
                .from('user_resumes')
                .select(columnName)
                .eq('user_id', user.id)
                .maybeSingle(); // Use maybeSingle to avoid 406 error if not found

            if (error || !userTemplate || !userTemplate[columnName]) {
                throw new Error('Could not load your saved version');
            }

            const prevCode = cm.getValue();

            // Set in editor
            if (cm) {
                cm.setValue(userTemplate[columnName]);
                originalLatexCode = userTemplate[columnName];
                hasChanges = false;
            }

            // Update state
            currentTemplateSource = 'user';
            updateVersionButtons();

            // Compile only if content changed or no PDF exists
            // formatting: trim whitespace to avoid false positives (e.g. trailing newlines)
            const cleanPrev = prevCode ? prevCode.trim() : "";
            const cleanNew = userTemplate[columnName] ? userTemplate[columnName].trim() : "";

            if (cleanPrev !== cleanNew || !pdfDoc) {
                // Show skeleton loader immediately before compilation starts
                toggleSkeleton(true);

                await compileLatex(userTemplate[columnName]);
                setStatus('Your saved version loaded', 'success');
            } else {
                setStatus('Already using your saved version', 'success');
            }

        } catch (error) {
            console.error('Error loading user version:', error);
            setStatus('Error loading your saved version', 'error');
        } finally {
            hideLoader();
        }
    }

    /**
     * Update template name display in header
     */
    function updateTemplateNameDisplay() {
        const displayEl = document.getElementById('template-name-display');
        if (!displayEl || !currentTemplateName) {
            if (displayEl) displayEl.style.display = 'none';
            return;
        }

        let formattedName = "";
        if (currentTemplateName === 'ai' || currentTemplateName === 'ai-resume') {
            formattedName = "AI Resume";
        } else {
            formattedName = currentTemplateName
                .split('-')
                .map(word => {
                    if (word.toLowerCase() === 'ats') return 'ATS';
                    return word.charAt(0).toUpperCase() + word.slice(1);
                })
                .join(' ');
        }

        displayEl.textContent = formattedName;
        displayEl.style.display = 'block';
    }

    /**
     * Load original default template
     * Does NOT delete user data - just loads default into editor
     */
    async function handleLoadOriginal() {
        try {
            // Remove global loader
            showLoader('Loading original template...');
            setStatus('Loading original template...', 'info');

            // Show skeleton instead
            toggleSkeleton(true);

            const { data: defaultTemplate, error } = await supabase
                .from('latex_templates')
                .select('latex_code')
                .eq('template_name', currentTemplateName)
                .maybeSingle();

            if (error) {
                throw error;
            }

            const prevCode = cm.getValue();

            // Set in editor
            if (cm) {
                cm.setValue(defaultTemplate.latex_code);
                originalLatexCode = defaultTemplate.latex_code;
                hasChanges = false;
            }

            // Update state
            currentTemplateSource = 'default';
            updateVersionButtons();

            // Compile only if content changed or no PDF exists
            // formatting: trim whitespace to avoid false positives
            const cleanPrev = prevCode ? prevCode.trim() : "";
            const cleanNew = defaultTemplate.latex_code ? defaultTemplate.latex_code.trim() : "";

            if (cleanPrev !== cleanNew || !pdfDoc) {
                // Show skeleton loader immediately before compilation starts
                toggleSkeleton(true);

                await compileLatex(defaultTemplate.latex_code);
                setStatus('Original template loaded', 'success');
            } else {
                setStatus('Already using original template', 'success');
            }

        } catch (error) {
            console.error('Error loading original:', error);
            setStatus('Error loading original template', 'error');
        } finally {
            hideLoader();
        }
    }

    // --- PDF.js VIEWER LOGIC ---
    let pdfDoc = null;
    let currentScale = 1.8;
    let isRendering = false;
    let renderPending = false;
    let pendingUrl = null;
    let currentRenderId = 0;

    // PDF.js worker setup
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    async function setPdfSrc(url) {
        if (!url) return;
        let fullUrl = url;
        if (url.startsWith("/files/")) {
            fullUrl = API_BASE + url;
        }

        // Add timestamp to ensure fetch gets latest version
        const separator = fullUrl.includes('?') ? '&' : '?';
        const fetchUrl = `${fullUrl}${separator}t=${Date.now()}`;

        await loadPDF(fetchUrl);
    }

    async function loadPDF(url) {
        toggleSkeleton(true);

        try {
            const loadingTask = pdfjsLib.getDocument(url);
            pdfDoc = await loadingTask.promise;

            document.getElementById('pageCount').textContent = pdfDoc.numPages;
            const pageNumEl = document.getElementById('pageNum');
            if (pageNumEl) pageNumEl.textContent = 1;
            await renderAllPages();

            // Give layout a moment to settle
            setTimeout(() => {
                // Default to 180% zoom
                currentScale = 1.8;
                updateVisualScale();

                // Reset scroll to top
                const viewer = document.getElementById('pdfViewer');
                if (viewer) {
                    viewer.scrollTop = 0;
                    viewer.scrollLeft = 0;
                }
            }, 100);

        } catch (err) {
            console.error('Error loading PDF:', err);
        } finally {
            // Robust cleanup: ensure both the skeleton and the placeholder are hidden
            toggleSkeleton(false);
            const noPreviewPlaceholder = document.getElementById('no-preview-placeholder');
            if (noPreviewPlaceholder) noPreviewPlaceholder.style.display = 'none';
        }
    }

    async function renderAllPages() {
        const renderId = ++currentRenderId;
        const container = document.getElementById('pdfCanvasContainer');
        if (!container || !pdfDoc) return;

        container.innerHTML = ''; // Clear old pages

        for (let i = 1; i <= pdfDoc.numPages; i++) {
            // If a new render has started, abort this one
            if (renderId !== currentRenderId) return;

            const page = await pdfDoc.getPage(i);

            // Check again after await as another render might have started
            if (renderId !== currentRenderId) return;

            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page-canvas';
            container.appendChild(canvas);

            await renderPage(page, canvas);
        }
    }

    async function renderPage(page, canvas) {
        // We render at a high resolution (2x) for sharp text, then scale visually
        const viewport = page.getViewport({ scale: 2.0 });
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;
    }

    function updateVisualScale() {
        const wrapper = document.getElementById('pdfViewportWrapper');
        const container = document.getElementById('pdfCanvasContainer');
        const inner = document.getElementById('pdfInnerContainer');
        const zoomValue = document.querySelector('.zoom-value');
        if (!wrapper || !container || !inner) return;

        const visualScale = currentScale / 2.0;
        wrapper.style.transform = `scale(${visualScale})`;

        // Re-calculate the actual visual height to prevent "phantom" space or clipping
        let totalH = 0;
        const canvases = container.querySelectorAll('canvas');

        // If no canvases, use skeleton height
        if (canvases.length === 0) {
            const skeletons = wrapper.querySelectorAll('.skeleton-container');
            if (skeletons.length > 0) {
                let skeletonH = 0;
                skeletons.forEach(sk => {
                    skeletonH += (sk.offsetHeight || 848);
                });
                const skeletonGap = skeletons.length > 1 ? (skeletons.length - 1) * 30 : 0;
                totalH = skeletonH + skeletonGap;
            } else {
                totalH = 848;
            }
        } else {
            canvases.forEach(canvas => {
                totalH += (canvas.height / 2.0); // Canvases are rendered at 2.0 scale
            });
        }

        // 30px is the gap between pages defined in CSS
        const totalGap = canvases.length > 1 ? (canvases.length - 1) * 30 : 0;
        const scaledHeight = (totalH + totalGap) * visualScale;

        // Apply the calculated height to the inner container to ensure correct scrolling
        inner.style.height = `${scaledHeight + 120}px`; // Increased padding for better scroll feel

        if (zoomValue) zoomValue.textContent = Math.round(currentScale * 100) + '%';
    }

    function getPdfPadding() {
        return window.innerWidth <= 768 ? 0 : 120; // 0 padding for mobile "full screen"
    }

    function fitToWidth() {
        if (!pdfDoc) return;
        const viewer = document.getElementById('pdfViewer');
        const container = document.getElementById('pdfCanvasContainer');
        if (!viewer || !container) return;

        pdfDoc.getPage(1).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            const padding = getPdfPadding();
            const availableWidth = viewer.clientWidth - padding;
            currentScale = Math.min(availableWidth / viewport.width, 2.3);
            updateVisualScale();
        });
    }

    // Global Resize Handler for PDF Viewer (Editor Page)
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        const currentWidth = window.innerWidth;
        if (currentWidth !== lastWidth) {
            lastWidth = currentWidth;
            // Removed strict fitToWidth on resize to respect user zoom preference
            // if (pdfDoc && document.getElementById('pdfViewer')) {
            //     fitToWidth();
            // }
        }
    });

    function fitToPage() {
        if (!pdfDoc) return;
        const viewer = document.getElementById('pdfViewer');
        if (!viewer) return;

        pdfDoc.getPage(1).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            const padding = getPdfPadding();
            const availableHeight = viewer.clientHeight - padding;
            currentScale = Math.min(availableHeight / viewport.height, 2.3);
            updateVisualScale();
        });
    }

    function setupToolbarFeatures() {
        const zoomIn = document.getElementById('zoomIn');
        const zoomOut = document.getElementById('zoomOut');
        const fitWidthBtn = document.getElementById('fitWidthBtn');
        const copyLinkBtn = document.getElementById('copyLinkBtn');
        const pdfViewer = document.getElementById('pdfViewer');
        const toggleTheme = document.getElementById('toggleTheme');

        if (zoomIn) {
            zoomIn.onclick = () => {
                const oldScale = currentScale;
                currentScale = Math.min(currentScale + 0.1, 2.3);
                updateVisualScale();
            };
        }
        if (zoomOut) {
            zoomOut.onclick = () => {
                currentScale = Math.max(currentScale - 0.1, 0.4);
                updateVisualScale();
            };
        }

        if (toggleTheme) {
            toggleTheme.onclick = () => {
                const container = document.getElementById('pdfCanvasContainer');
                if (container) {
                    container.classList.toggle('pdf-dark-mode');
                }
            };
        }

        if (fitWidthBtn) {
            fitWidthBtn.onclick = fitToWidth;
        }

        if (copyLinkBtn) {
            copyLinkBtn.onclick = async () => {
                const urlToCopy = lastCompiledPdfUrl;
                if (!urlToCopy) {
                    window.showToast('No PDF link available yet. Please recompile first.', 'info');
                    return;
                }

                const cleanUrl = urlToCopy.split('?')[0];
                try {
                    await navigator.clipboard.writeText(cleanUrl);

                    // Visual feedback on button
                    const originalHTML = copyLinkBtn.innerHTML;
                    copyLinkBtn.innerHTML = '<i data-lucide="check"></i>';
                    if (window.lucide) window.lucide.createIcons();

                    setTimeout(() => {
                        copyLinkBtn.innerHTML = originalHTML;
                        if (window.lucide) window.lucide.createIcons();
                    }, 1500);
                } catch (err) {
                    console.error('Failed to copy text: ', err);
                    window.showToast('Failed to copy link', 'error');
                }
            };
        }

        // --- Page Navigation (Scroll to page) ---
        const prevPage = document.getElementById('prevPage');
        const nextPage = document.getElementById('nextPage');
        const pageNum = document.getElementById('pageNum');

        if (prevPage) {
            prevPage.onclick = () => {
                const current = parseInt(pageNum.textContent);
                if (current > 1) {
                    scrollToPage(current - 1);
                }
            };
        }

        if (nextPage) {
            nextPage.onclick = () => {
                const current = parseInt(pageNum.textContent);
                const total = parseInt(document.getElementById('pageCount').textContent);
                if (current < total) {
                    scrollToPage(current + 1);
                }
            };
        }

        function scrollToPage(num) {
            const container = document.getElementById('pdfCanvasContainer');
            const canvases = container.querySelectorAll('.pdf-page-canvas');
            if (canvases[num - 1]) {
                canvases[num - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
                pageNum.textContent = num;
            }
        }

        // Update page number on scroll
        pdfViewer.addEventListener('scroll', () => {
            const canvases = pdfViewer.querySelectorAll('.pdf-page-canvas');
            const viewerRect = pdfViewer.getBoundingClientRect();

            canvases.forEach((canvas, index) => {
                const rect = canvas.getBoundingClientRect();
                if (rect.top < viewerRect.bottom && rect.bottom > viewerRect.top) {
                    // This page is visible
                    if (rect.top < viewerRect.top + viewerRect.height / 2) {
                        pageNum.textContent = index + 1;
                    }
                }
            });
        });

        // --- Overleaf Mouse Interaction ---
        if (pdfViewer) {
            // Ctrl + Wheel Zoom
            pdfViewer.addEventListener('wheel', (e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? -0.1 : 0.1;
                    const oldScale = currentScale;
                    currentScale = Math.min(Math.max(currentScale + delta, 0.4), 2.3);

                    // Maintain focus (Overleaf centering)
                    const rect = pdfViewer.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;

                    const scrollX = pdfViewer.scrollLeft;
                    const scrollY = pdfViewer.scrollTop;

                    const ratio = currentScale / oldScale;

                    updateVisualScale();

                    pdfViewer.scrollLeft = (scrollX + mouseX) * ratio - mouseX;
                    pdfViewer.scrollTop = (scrollY + mouseY) * ratio - mouseY;
                }
            }, { passive: false });

            // Pan / Drag Logic (Mouse)
            let isPanning = false;
            let startX, startY, startScrollLeft, startScrollTop;

            pdfViewer.addEventListener('mousedown', (e) => {
                if (e.button === 0) { // Left click
                    isPanning = true;
                    pdfViewer.classList.add('grabbing');
                    pdfViewer.classList.remove('grab');

                    startX = e.clientX;
                    startY = e.clientY;
                    startScrollLeft = pdfViewer.scrollLeft;
                    startScrollTop = pdfViewer.scrollTop;
                }
            });

            // Touch Panning & Pinch-to-Zoom
            let isTouchPanning = false;
            let lastTouchDistance = 0;

            pdfViewer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    isTouchPanning = true;
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                    startScrollLeft = pdfViewer.scrollLeft;
                    startScrollTop = pdfViewer.scrollTop;
                } else if (e.touches.length === 2) {
                    isTouchPanning = false;
                    lastTouchDistance = Math.hypot(
                        e.touches[0].pageX - e.touches[1].pageX,
                        e.touches[0].pageY - e.touches[1].pageY
                    );
                }
            }, { passive: false });

            pdfViewer.addEventListener('touchmove', (e) => {
                if (e.touches.length === 1 && isTouchPanning) {
                    const dx = e.touches[0].clientX - startX;
                    const dy = e.touches[0].clientY - startY;
                    pdfViewer.scrollLeft = startScrollLeft - dx;
                    pdfViewer.scrollTop = startScrollTop - dy;
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                        e.preventDefault();
                    }
                } else if (e.touches.length === 2) {
                    e.preventDefault();
                    const currentDistance = Math.hypot(
                        e.touches[0].pageX - e.touches[1].pageX,
                        e.touches[0].pageY - e.touches[1].pageY
                    );

                    const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

                    const delta = currentDistance - lastTouchDistance;
                    if (Math.abs(delta) > 5) {
                        const oldScale = currentScale;
                        const zoomFactor = delta > 0 ? 1.05 : 0.95;
                        currentScale = Math.min(Math.max(currentScale * zoomFactor, 0.4), 2.3);

                        const rect = pdfViewer.getBoundingClientRect();
                        const ratio = currentScale / oldScale;
                        updateVisualScale();

                        pdfViewer.scrollLeft = (pdfViewer.scrollLeft + (centerX - rect.left)) * ratio - (centerX - rect.left);
                        pdfViewer.scrollTop = (pdfViewer.scrollTop + (centerY - rect.top)) * ratio - (centerY - rect.top);

                        lastTouchDistance = currentDistance;
                    }
                }
            }, { passive: false });

            pdfViewer.addEventListener('touchend', () => {
                isTouchPanning = false;
            });

            document.addEventListener('mousemove', (e) => {
                if (!isPanning) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                pdfViewer.scrollLeft = startScrollLeft - dx;
                pdfViewer.scrollTop = startScrollTop - dy;
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

    function setStatus(text, type = 'info') {
        const statusBadge = document.getElementById('statusBadge');
        if (statusBadge) {
            statusBadge.textContent = text;
            statusBadge.style.display = 'inline-block';

            // Set color based on type
            statusBadge.className = 'status-badge';
            statusBadge.classList.add(`status-${type}`);

            // Auto hide after 3s
            setTimeout(() => {
                statusBadge.style.display = 'none';
            }, 3000);
        }

        // Only show the prominent modal for errors
        if (type === 'error') {
            showAlert(text, type);
        }
    }

    /**
     * Show custom alert modal
     * @param {string} message - Message to show
     * @param {string} type - 'error', 'success', 'warning', or 'info'
     */
    function showAlert(message, type = 'info') {
        const modal = document.getElementById('customAlertModal');
        const messageEl = document.getElementById('alertModalMessage');
        const iconEl = document.querySelector('.alert-modal-icon');

        if (!modal || !messageEl) {
            console.error('Alert Modal elements not found in DOM!');
            return;
        }

        // Set message
        messageEl.textContent = message;

        // Set icon based on type
        if (iconEl) {
            switch (type) {
                case 'error': iconEl.textContent = '❌'; break;
                case 'success': iconEl.textContent = '✅'; break;
                case 'warning': iconEl.textContent = '⚠️'; break;
                default: iconEl.textContent = 'ℹ️';
            }
        }

        // Show modal - ensure it is visible and centered
        modal.style.display = 'flex';

        // Focus OK button for keyboard users
        setTimeout(() => {
            const okBtn = document.getElementById('alertModalOkBtn');
            if (okBtn) okBtn.focus();
        }, 50);
    }

    function closeAlert() {
        const modal = document.getElementById('customAlertModal');
        if (modal) modal.style.display = 'none';
    }

    function downloadPdf() {
        window.open(`${API_BASE}/api/download`, "_blank");
    }

    function restorePanelSizes() {
        const isVertical = window.innerWidth <= 1147;
        const editorPanel = document.querySelector('.editor-panel');

        if (editorPanel) {
            if (isVertical) {
                // Set default height to 50% of viewport height
                editorPanel.style.height = '50vh';
                editorPanel.style.width = '100%';
                editorPanel.style.flex = 'none';
            } else {
                // Set default width to 50%
                editorPanel.style.width = '50%';
                editorPanel.style.height = '100%';
                editorPanel.style.flex = 'none';
            }
        }

        // Refresh CodeMirror if it exists
        if (cm) {
            setTimeout(() => cm.refresh(), 100);
        }
    }

    function setupResizer() {
        const resizer = document.getElementById('resizer');
        const panel = document.querySelector('.editor-panel'); // Top or Left panel
        const container = document.querySelector('.editor-container');

        if (!resizer || !panel || !container) return;

        let isResizing = false;

        const startResizing = () => {
            isResizing = true;
            resizer.classList.add('resizer-active');
            const isVertical = window.innerWidth <= 1147;
            document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
            container.style.userSelect = 'none';
        };

        const doResizing = (clientX, clientY) => {
            if (!isResizing) return;

            const isVertical = window.innerWidth <= 1147;
            const rect = container.getBoundingClientRect();

            if (isVertical) {
                // Vertical Resizing (Stacked panels)
                const newHeight = clientY - rect.top;
                const minH = window.innerWidth <= 768 ? 50 : 200; // More flexibility on mobile

                if (newHeight >= minH) {
                    panel.style.height = `${newHeight}px`;
                    panel.style.width = '100%';
                    panel.style.flex = 'none';
                }
            } else {
                // Horizontal Resizing (Side-by-side)
                const newWidth = clientX - rect.left;
                const minW = 380; // Hard minimum to fit toolbar buttons
                const maxW = rect.width * 0.8;

                if (newWidth > minW && newWidth < maxW) {
                    panel.style.width = `${newWidth}px`;
                    panel.style.height = '100%';
                    panel.style.flex = 'none';
                }
            }

            if (cm) cm.refresh();
            // fitToWidth(); // Keep the zoom at 180% as requested by the user
        };

        const stopResizing = () => {
            if (isResizing) {
                isResizing = false;
                resizer.classList.remove('resizer-active');
                document.body.style.cursor = '';
                container.style.userSelect = '';
                if (cm) cm.refresh();
            }
        };

        resizer.addEventListener('mousedown', (e) => {
            startResizing();
            e.preventDefault();
        });

        // Ensure touch-action is none to prevent browser scrolling during resize
        resizer.style.touchAction = 'none';

        resizer.addEventListener('touchstart', (e) => {
            startResizing();
            e.stopPropagation();
            e.preventDefault(); // Intercept touch to start resizing immediately
        }, { passive: false });

        document.addEventListener('mousemove', (e) => doResizing(e.clientX, e.clientY));
        document.addEventListener('touchmove', (e) => {
            if (isResizing) {
                doResizing(e.touches[0].clientX, e.touches[0].clientY);
                e.preventDefault(); // Prevent scroll while resizing
            }
        }, { passive: false });

        document.addEventListener('mouseup', stopResizing);
        document.addEventListener('touchend', stopResizing);
    }

    function updateAuthUI(sessionData) {
        if (!supabase) return;

        // Use provided session or keep current state
        const user = sessionData?.user || currentUser;
        currentUser = user;

        // Get elements dynamically to avoid stale references from header injection
        const profileDropdown = $("profileDropdown");
        const profileAvatar = $("profileAvatar");
        const profileName = $("profileName");
        const profileEmail = $("profileEmail");
        const mobileAuthTrigger = $("mobileAuthTrigger");
        const currentAuthBtn = $("authBtn");

        if (user) {
            // Logged In State
            if (currentAuthBtn) currentAuthBtn.style.setProperty('display', 'none', 'important');
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

            // Update Mobile Auth Slot with Profile Avatar
            if (mobileAuthTrigger) {
                mobileAuthTrigger.innerHTML = `
                <div class="profile-avatar" id="headerProfileAvatar">${initials}</div>
            `;
                const headerAvatar = $("headerProfileAvatar");
                if (headerAvatar) {
                    headerAvatar.onclick = (e) => {
                        e.stopPropagation();
                        const profileMenu = $("profileMenu");
                        if (profileMenu) profileMenu.classList.toggle('active');
                    };
                }
            }
        } else {
            // Logged Out State
            if (currentAuthBtn) currentAuthBtn.style.setProperty('display', 'block', 'important');
            if (profileDropdown) profileDropdown.style.display = "none";

            // Update Mobile Auth Slot with Tiny Login Button
            if (mobileAuthTrigger) {
                mobileAuthTrigger.innerHTML = `
                <a href="login.html" class="btn-tiny-auth">Login</a>
            `;
            }
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

    function initAuth() {
        const profileAvatar = $("profileAvatar");
        const profileMenu = $("profileMenu");
        const logoutBtn = $("logoutBtn");

        if (!supabase) return;

        // Sync initial state
        supabase.auth.getSession().then(({ data: { session } }) => {
            updateAuthUI(session);
        });

        // Listen for changes
        supabase.auth.onAuthStateChange((event, session) => {
            updateAuthUI(session);
        });

        if (profileAvatar) {
            profileAvatar.onclick = (e) => {
                e.stopPropagation();
                if (profileMenu) profileMenu.classList.toggle('active');
            };
        }

        document.addEventListener('click', () => {
            if (profileMenu) profileMenu.classList.remove('active');
        });

        if (logoutBtn) {
            logoutBtn.onclick = async () => {
                await supabase.auth.signOut();
                window.location.href = 'index.html';
            };
        }
    }

    // Initialize
    async function init() {
        await initSupabase();
        initAuth();
        initCodeMirror();
        setupToolbarFeatures();
        await loadTemplate();
        setupResizer();
        restorePanelSizes();

        // Event listeners
        const recompileBtn = document.getElementById('recompileBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        const loadUserVersionBtn = document.getElementById('load-user-version-btn');
        const loadOriginalBtn = document.getElementById('load-original-btn');

        if (recompileBtn) {
            recompileBtn.addEventListener('click', handleRecompile);
        }

        if (downloadBtn) {
            downloadBtn.addEventListener('click', downloadPdf);
        }

        if (loadUserVersionBtn) {
            loadUserVersionBtn.addEventListener('click', handleLoadUserVersion);
        }

        if (loadOriginalBtn) {
            loadOriginalBtn.addEventListener('click', handleLoadOriginal);
        }

        // Alert Modal Close
        const alertOkBtn = document.getElementById('alertModalOkBtn');
        if (alertOkBtn) {
            alertOkBtn.addEventListener('click', closeAlert);
        }

        // Close on backdrop click
        const alertBackdrop = document.querySelector('.alert-modal-backdrop');
        if (alertBackdrop) {
            alertBackdrop.addEventListener('click', closeAlert);
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAlert();
        });

        // --- Premium Entrance Animation ---
        const container = document.querySelector('.editor-container');
        if (container) {
            // Short timeout ensures CSS transitions are ready
            setTimeout(() => {
                container.classList.add('panels-visible');
            }, 100);
        }
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Mobile Split View: Both panels are now persistently visible via CSS
})();
