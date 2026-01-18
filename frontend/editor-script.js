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
        originalLatexCode = cm.getValue();
        hasChanges = false;
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

        // Check if there are any changes to compile
        const currentLatex = cm.getValue();
        if (!hasChanges && currentLatex === originalLatexCode) {
            showAlert('No changes to compile. Edit the code first!', 'info');
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

            // 2. Show loading state on button
            if (recompileBtn) {
                recompileBtn.classList.add('loading');
                recompileBtn.disabled = true;
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
        const container = document.getElementById('pdfCanvasContainer');
        const inner = document.getElementById('pdfInnerContainer');
        const zoomValue = document.querySelector('.zoom-value');
        if (!container || !inner) return;

        const visualScale = currentScale / 2.0;
        container.style.transform = `scale(${visualScale})`;

        // Re-calculate the actual visual height to prevent "phantom" space or clipping
        let totalH = 0;
        const canvases = container.querySelectorAll('canvas');
        canvases.forEach(canvas => {
            totalH += (canvas.height / 2.0); // Canvases are rendered at 2.0 scale
        });

        // 30px is the gap between pages defined in CSS
        const totalGap = canvases.length > 1 ? (canvases.length - 1) * 30 : 0;
        const scaledHeight = (totalH + totalGap) * visualScale;

        // Apply the calculated height to the inner container to ensure correct scrolling
        inner.style.height = `${scaledHeight + 20}px`; // 20px for bottom padding (reduced from 80px)

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
        const fitPageBtn = document.getElementById('fitPageBtn');
        const pdfViewer = document.getElementById('pdfViewer');

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
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Mobile Split View: Both panels are now persistently visible via CSS
})();
