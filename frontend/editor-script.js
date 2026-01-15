/**
 * Editor Page Logic - Template Loading, Change Tracking, and Save
 * This script handles the editor.html page specifically for template editing
 */

(function () {
    "use strict";

    // API Base URL
    const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? ""
        : "https://ai-latex-resume-builder.onrender.com";

    // DOM Elements
    const latexEditor = document.getElementById("latexEditor");
    const recompileBtn = document.getElementById("recompileBtn");
    const downloadBtn = document.getElementById("downloadBtn");
    const compileLog = document.getElementById("compileLog");
    const pdfFrame = document.getElementById("pdfFrame");
    const statusBadge = document.getElementById("statusBadge");

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

    // Initialize CodeMirror
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
            const currentCode = cm.getValue();
            hasChanges = currentCode !== originalLatexCode;

            // Update recompile button state
            if (recompileBtn) {
                recompileBtn.disabled = !currentCode.trim();
            }
        });

        // Set initial size
        cm.setSize("100%", "100%");
    }

    // Handle Editor Toggling
    function setupEditorToggle() {
        const codeEditorBtn = document.getElementById('codeEditorBtn');
        const visualEditorBtn = document.getElementById('visualEditorBtn');
        const codeView = document.getElementById('codeView');
        const visualView = document.getElementById('visualView');

        if (!codeEditorBtn || !visualEditorBtn || !codeView || !visualView) return;

        codeEditorBtn.addEventListener('click', () => {
            codeEditorBtn.classList.add('active');
            visualEditorBtn.classList.remove('active');
            codeView.classList.add('active');
            visualView.classList.remove('active');
            if (cm) cm.refresh();
        });

        visualEditorBtn.addEventListener('click', () => {
            visualEditorBtn.classList.add('active');
            codeEditorBtn.classList.remove('active');
            visualView.classList.add('active');
            codeView.classList.remove('active');
        });
    }

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

                // Listen for auth state changes
                supabase.auth.onAuthStateChange(async (event, session) => {
                    currentUser = session?.user || null;
                    console.log('Auth state changed:', event, currentUser ? 'Logged in' : 'Logged out');
                });

                // Get current session
                const { data: { session } } = await supabase.auth.getSession();
                currentUser = session?.user || null;
            }
        } catch (err) {
            console.error('Failed to initialize Supabase:', err);
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
            setStatus('Loading template...', 'info');

            // Get template name from URL
            const params = getUrlParams();
            currentTemplateName = params.template || params.templateName;

            if (!currentTemplateName) {
                setStatus('Please select a template from the templates page', 'info');
                if (cm) cm.setValue('% Please select a template from the templates page to start editing.');
                const loader = document.getElementById('pdfPreviewLoader');
                if (loader) loader.style.display = 'none';
                hideLoader();
                return;
            }

            // Start parallel fetching for better performance
            const [authResult, defaultTemplateResult] = await Promise.all([
                supabase.auth.getUser(),
                supabase.from('latex_templates').select('latex_code').eq('template_name', currentTemplateName).single()
            ]);

            const { data: { user } } = authResult;
            currentUser = user;

            let latexCode = null;
            let isUserVersion = false;

            // 1. Try to fetch user's custom version if logged in
            if (user) {
                const columnName = getTemplateColumn(currentTemplateName);
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
                    console.log('Using user custom template (FAST LOAD)');
                } else {
                    userHasCustomVersion = false;
                }
            }

            // 2. Fallback to default template if no user version found
            if (!latexCode) {
                if (defaultTemplateResult.error) {
                    throw new Error('Failed to load default template: ' + defaultTemplateResult.error.message);
                }
                latexCode = defaultTemplateResult.data.latex_code;
                currentTemplateSource = 'default';
                console.log('Using default template (FAST LOAD)');
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
            setStatus('Error loading template: ' + error.message, 'error');
            hideLoader(); // Ensure loader is hidden on total failure
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
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    }

    /**
     * Hide global app loader
     */
    function hideLoader() {
        if (!appLoader) initLoader();
        if (!appLoader) return;

        appLoader.classList.remove('active');
        document.body.style.overflow = ''; // Restore scrolling
    }

    // Compile LaTeX code
    async function compileLatex(latex) {
        if (isCompiling) return;
        isCompiling = true;

        const loader = document.getElementById('pdfPreviewLoader');
        const status = document.getElementById('pdfLoaderStatus');

        if (loader) loader.style.display = 'flex';
        if (status) status.textContent = 'Compiling LaTeX...';

        try {
            const response = await fetch(`${API_BASE}/api/recompile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latex })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.details || 'Compilation failed');
            }

            if (status) status.textContent = 'Rendering PDF...';

            // Update PDF preview using the new PDF.js engine
            await setPdfSrc(data.pdfUrl || "/files/resume.pdf");

            if (compileLog) {
                compileLog.textContent = data.log || "Compilation successful.";
                compileLog.classList.remove("has-error");
            }
            if (downloadBtn) downloadBtn.disabled = false;

        } catch (err) {
            console.error('Compilation error:', err);
            if (compileLog) {
                compileLog.textContent = err.message;
                compileLog.classList.add("has-error");
            }
            throw err;
        } finally {
            // loader hidden in setPdfSrc -> loadPDF or here if failed
            if (loader) loader.style.display = 'none';
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

        try {
            // 1. Check authentication
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                setStatus('Please login to save changes', 'error');
                window.location.href = 'login.html';
                return;
            }

            // 2. Get current LaTeX code
            const currentLatex = cm.getValue();

            // 3. Check if there are changes (Robust comparison)
            const cleanCurrent = currentLatex.trim().replace(/\r\n/g, '\n');
            const cleanOriginal = (originalLatexCode || '').trim().replace(/\r\n/g, '\n');

            if (cleanCurrent === cleanOriginal) {
                console.log('Recompile blocked: No changes detected.');
                setStatus('Make changes in code then recompile', 'warning');
                return;
            }

            setStatus('Recompiling and saving...', 'info');

            // 4. Determine which column to update
            if (!currentTemplateName) {
                setStatus('Please select a template first', 'error');
                return;
            }
            const columnName = getTemplateColumn(currentTemplateName);

            // 5. Check if user row exists
            const { data: existingRow, error: checkError } = await supabase
                .from('user_resumes')
                .select('user_id')
                .eq('user_id', user.id)
                .single();

            if (checkError && checkError.code !== 'PGRST116') {
                // Error other than "no rows found"
                throw checkError;
            }

            // 6. INSERT or UPDATE
            if (!existingRow) {
                // INSERT new row
                const { error: insertError } = await supabase
                    .from('user_resumes')
                    .insert({
                        user_id: user.id,
                        [columnName]: currentLatex,
                        updated_at: new Date().toISOString()
                    });

                if (insertError) {
                    throw insertError;
                }
                console.log('Created new user template row');
            } else {
                // UPDATE existing row
                const { error: updateError } = await supabase
                    .from('user_resumes')
                    .update({
                        [columnName]: currentLatex,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', user.id);

                if (updateError) {
                    throw updateError;
                }
                console.log('Updated user template');
            }

            // 7. Update original code and compile
            originalLatexCode = currentLatex;
            hasChanges = false;

            // 8. Compile to PDF
            await compileLatex(currentLatex);

            // 9. Update state - user now has custom version
            userHasCustomVersion = true;
            currentTemplateSource = 'user';
            updateVersionButtons();

            setStatus('Saved and compiled successfully!', 'success');

        } catch (error) {
            console.error('Error recompiling:', error);
            setStatus('Error: ' + error.message, 'error');
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
            showLoader('Loading your saved version...');
            setStatus('Loading your saved version...', 'info');

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

            // Set in editor
            if (cm) {
                cm.setValue(userTemplate[columnName]);
                originalLatexCode = userTemplate[columnName];
                hasChanges = false;
            }

            // Update state
            currentTemplateSource = 'user';
            updateVersionButtons();

            // Compile
            await compileLatex(userTemplate[columnName]);

            setStatus('Your saved version loaded', 'success');

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

        const formattedName = currentTemplateName
            .split('-')
            .map(word => {
                if (word.toLowerCase() === 'ats') return 'ATS';
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');

        displayEl.textContent = formattedName;
        displayEl.style.display = 'block';
    }

    /**
     * Load original default template
     * Does NOT delete user data - just loads default into editor
     */
    async function handleLoadOriginal() {
        try {
            showLoader('Loading original template...');
            setStatus('Loading original template...', 'info');

            // Load default template from database
            const { data: defaultTemplate, error } = await supabase
                .from('latex_templates')
                .select('latex_code')
                .eq('template_name', currentTemplateName)
                .single();

            if (error) {
                throw error;
            }

            // Set in editor
            if (cm) {
                cm.setValue(defaultTemplate.latex_code);
                originalLatexCode = defaultTemplate.latex_code;
                hasChanges = false;
            }

            // Update state
            currentTemplateSource = 'default';
            updateVersionButtons();

            // Compile
            await compileLatex(defaultTemplate.latex_code);

            setStatus('Original template loaded', 'success');

        } catch (error) {
            console.error('Error loading original:', error);
            setStatus('Error loading original template', 'error');
        } finally {
            hideLoader();
        }
    }

    // --- PDF.js VIEWER LOGIC ---
    let pdfDoc = null;
    let currentScale = 1.0;
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
        const loader = document.getElementById('pdfPreviewLoader');
        const status = document.getElementById('pdfLoaderStatus');
        if (loader) loader.style.display = 'flex';
        if (status) status.textContent = 'Loading Document...';

        try {
            const loadingTask = pdfjsLib.getDocument(url);
            pdfDoc = await loadingTask.promise;

            if (status) status.textContent = 'Rendering Pages...';
            document.getElementById('pageCount').textContent = pdfDoc.numPages;
            const pageNumEl = document.getElementById('pageNum');
            if (pageNumEl) pageNumEl.textContent = 1;
            await renderAllPages();

            // Initial zoom: Fit Width
            fitToWidth();

        } catch (err) {
            console.error('Error loading PDF:', err);
            // Fallback: if PDF.js fails, we could try iframe, but per requirement we don't
        } finally {
            if (loader) loader.style.display = 'none';
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
        const container = document.getElementById('pdfCanvasContainer');
        const zoomValue = document.querySelector('.zoom-value');
        if (!container) return;

        // The canvas was rendered at scale 2.0 (high res)
        // We want to scale it to match currentScale
        // visualScale = currentScale / 2.0
        const visualScale = currentScale / 2.0;
        container.style.transform = `scale(${visualScale})`;

        if (zoomValue) zoomValue.textContent = Math.round(currentScale * 100) + '%';
    }

    function fitToWidth() {
        if (!pdfDoc) return;
        const viewer = document.getElementById('pdfViewer');
        const container = document.getElementById('pdfCanvasContainer');
        if (!viewer || !container) return;

        pdfDoc.getPage(1).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            const availableWidth = viewer.clientWidth - 80; // Padding
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
            const availableHeight = viewer.clientHeight - 80;
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

        if (zoomIn) {
            zoomIn.onclick = () => {
                const oldScale = currentScale;
                currentScale = Math.min(currentScale + 0.1, 3.0);
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
                    currentScale = Math.min(Math.max(currentScale + delta, 0.4), 3.0);

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

            // Pan / Drag Logic
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
        // Only show the prominent alert for warnings (like the recompile block) and errors
        if (type === 'error' || type === 'warning') {
            showAlert(text, type);
        }
        console.log(`[${type.toUpperCase()}] ${text}`);
    }

    /**
     * Show custom alert modal
     * @param {string} message - Message to show
     * @param {string} type - 'error', 'success', 'warning', or 'info'
     */
    function showAlert(message, type = 'info') {
        console.log(`showAlert called with: ${message} (${type})`);
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

    function setupResizer() {
        const resizer = document.getElementById('resizer');
        const leftPanel = document.querySelector('.editor-panel');
        const container = document.querySelector('.editor-container');
        const pdfViewer = document.getElementById('pdfViewer');

        if (!resizer || !leftPanel || !container) return;

        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'col-resize';
            container.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const containerRect = container.getBoundingClientRect();
            const newWidth = e.clientX - containerRect.left;

            const minWidth = containerRect.width * 0.2;
            const maxWidth = containerRect.width * 0.8;

            if (newWidth > minWidth && newWidth < maxWidth) {
                leftPanel.style.width = `${newWidth}px`;
                leftPanel.style.flex = 'none';
                if (cm) cm.refresh();
                // When resizing, we might want to re-fit the PDF to width
                fitToWidth();
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                container.style.userSelect = '';
                if (cm) cm.refresh();
            }
        });
    }

    function initAuth() {
        const authBtn = document.getElementById('authBtn');
        const profileDropdown = document.getElementById('profileDropdown');
        const profileAvatar = document.getElementById('profileAvatar');
        const profileName = document.getElementById('profileName');
        const profileEmail = document.getElementById('profileEmail');
        const profileMenu = document.getElementById('profileMenu');
        const logoutBtn = document.getElementById('logoutBtn');

        if (!supabase) return;

        supabase.auth.onAuthStateChange((event, session) => {
            const user = session?.user;
            if (user) {
                if (authBtn) authBtn.style.display = 'none';
                if (profileDropdown) profileDropdown.style.display = 'block';
                if (profileName) profileName.textContent = user.user_metadata?.username || user.email.split('@')[0];
                if (profileEmail) profileEmail.textContent = user.email;
                if (profileAvatar) {
                    const initials = (user.user_metadata?.username || user.email.split('@')[0])
                        .substring(0, 2).toUpperCase();
                    profileAvatar.textContent = initials;
                }
            } else {
                if (authBtn) authBtn.style.display = 'block';
                if (profileDropdown) profileDropdown.style.display = 'none';
            }
        });

        if (profileAvatar) {
            profileAvatar.onclick = (e) => {
                e.stopPropagation();
                profileMenu.classList.toggle('active');
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

    // Visual Editor Sync
    function setupVisualEditorSync() {
        // Initialize form from LaTeX when switching TO visual mode
        const visualEditorBtn = document.getElementById('visualEditorBtn');
        if (visualEditorBtn) {
            visualEditorBtn.addEventListener('click', () => {
                const latex = cm.getValue();

                // Name
                const nameMatch = latex.match(/\\Huge \\textbf\{([^{}]*)\}/) || latex.match(/\\textbf\{\\Huge ([^{}]*)\}/);
                if (nameMatch) document.getElementById('vis-name').value = nameMatch[1].trim();

                // Email
                const emailMatch = latex.match(/\\href\{mailto:([^}]*)\}/);
                if (emailMatch) document.getElementById('vis-email').value = emailMatch[1].trim();

                // Phone/Location (Template specific matches)
                const contactLineMatch = latex.match(/\\begin\{center\}([\s\S]*?)\\end\{center\}/);
                if (contactLineMatch) {
                    const content = contactLineMatch[1];
                    const parts = content.split('|').map(p => p.replace(/\\textbar/g, '').trim());
                    if (parts[0]) {
                        // First part might be location or phone
                        if (parts[0].includes('@')) { /* skip email */ }
                        else if (parts[0].match(/\d/)) document.getElementById('vis-phone').value = parts[0];
                        else if (parts[0].includes(',')) document.getElementById('vis-location').value = parts[0];
                    }
                }

                // Summary
                const summaryMatch = latex.match(/\\section\{Summary\}([\s\S]*?)\\section/i);
                if (summaryMatch) {
                    document.getElementById('vis-summary').value = summaryMatch[1].trim();
                }
            });
        }

        // Update LaTeX when form fields change
        const inputs = ['vis-name', 'vis-email', 'vis-phone', 'vis-location', 'vis-summary'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateLatexFromForm);
            }
        });
    }

    function updateLatexFromForm() {
        if (!cm) return;
        let latex = cm.getValue();

        const name = document.getElementById('vis-name').value;
        const email = document.getElementById('vis-email').value;
        const phone = document.getElementById('vis-phone').value;
        const location = document.getElementById('vis-location').value;
        const summary = document.getElementById('vis-summary').value;

        // Replace Name
        latex = latex.replace(/(\\Huge \\textbf\{)([^{}]*)(\})/, `$1${name}$3`);

        // Replace Email (Complex because it appears twice usually)
        latex = latex.replace(/(\\href\{mailto:)([^{}]*)(\})/, `$1${email}$3`);

        // Update summary if it exists
        if (summary) {
            latex = latex.replace(/(\\section\{Summary\})([\s\S]*?)(\\section)/i, `$1\n${summary}\n\n$3`);
        }

        cm.setValue(latex);
        hasChanges = true;
    }

    // Initialize
    async function init() {
        await initSupabase();
        initAuth();
        initCodeMirror();
        setupEditorToggle();
        setupToolbarFeatures();
        setupVisualEditorSync();
        await loadTemplate();
        setupResizer();

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
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
