/**
 * builder-core.js - Dedicated logic for the AI Resume Builder workspace.
 * Extracted from original script.js to improve page-load performance.
 */

(function () {
    "use strict";

    // Page state
    let pdfDoc = null;
    let currentScale = 1.8;
    let currentRenderId = 0;
    let cm = null;
    let originalLatexCode = "";
    let hasChanges = false;
    let isCompiling = false;
    let latestGeneratedPdfUrl = null;

    // --- PDF.js CONFIG ---
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // --- CODEMIRROR ---
    window.initCodeMirror = function () {
        const latexEditor = $('latexEditor');
        if (!latexEditor) return;

        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const cmTheme = currentTheme === 'light' ? 'default' : 'dracula';

        cm = CodeMirror.fromTextArea(latexEditor, {
            mode: "stex",
            theme: cmTheme,
            lineNumbers: true,
            lineWrapping: true,
            gutters: ["CodeMirror-linenumbers", "errors-gutter"],
            tabSize: 4,
            indentUnit: 4,
            viewportMargin: Infinity
        });

        cm.on('change', () => {
            const currentCode = cm.getValue();
            hasChanges = currentCode !== originalLatexCode;
            const btn = $('recompileBtn');
            if (btn) btn.disabled = !currentCode.trim();
        });

        cm.setSize("100%", "100%");
        originalLatexCode = cm.getValue();
        hasChanges = false;

        // Sync theme
        const observer = new MutationObserver(() => {
            const newTheme = document.documentElement.getAttribute('data-theme');
            if (cm) cm.setOption('theme', newTheme === 'light' ? 'default' : 'dracula');
        });
        observer.observe(document.documentElement, { attributes: true });

        window._cm = cm; // Global ref for upload logic
    };

    window.setEditorValue = function (val) {
        if (cm) {
            cm.setValue(val || "");
            originalLatexCode = val || "";
            hasChanges = false;
        }
    };

    window.getEditorValue = function () {
        return cm ? cm.getValue() : "";
    };

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

    function toggleSkeleton(show) {
        const loader = $('pdfPreviewLoader');
        const noPreviewPlaceholder = $('no-preview-placeholder');
        if (!loader) return;

        if (show) {
            // Hide placeholder if showing skeleton
            if (noPreviewPlaceholder) noPreviewPlaceholder.style.display = 'none';

            // Determine how many pages to show (default 1)
            let numPages = 1;
            if (pdfDoc && pdfDoc.numPages) {
                numPages = pdfDoc.numPages;
            }

            // Populate skeleton pages
            loader.innerHTML = Array(numPages).fill(SKELETON_PAGE_HTML).join('');
            loader.style.display = 'flex';

            // Re-calculate view height for skeletons
            window.updateVisualScale();
        } else {
            loader.style.display = 'none';
        }
    }

    // Focus/restore listener
    window.addEventListener('focus', () => {
        // Scroll lock is now handled individually by global loaders only
    });

    // --- ERROR HANDLING HELPERS ---
    function formatCompileLog(log) {
        if (!log) return "Compilation successful.";
        const lines = log.split('\n');
        return lines.map(line => {
            const escapedLine = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            if (escapedLine.includes('Error:') || escapedLine.startsWith('! ')) {
                return `<div class="error-item"><span class="error-line">Error</span><span class="error-msg">${escapedLine}</span></div>`;
            } else if (escapedLine.includes('Warning:')) {
                return `<div class="error-item"><span class="error-line" style="color: #fbbf24;">Warning</span><span class="error-msg">${escapedLine}</span></div>`;
            }
            return `<div style="opacity: 0.8; margin-bottom: 4px;">${escapedLine}</div>`;
        }).join('');
    }

    function parseErrorLines(log) {
        if (!log) return [];
        const errors = [];
        const lineRegex = /l\.(\d+)/g;
        let match;
        while ((match = lineRegex.exec(log)) !== null) {
            const lineNum = parseInt(match[1], 10);
            const textBefore = log.substring(Math.max(0, match.index - 200), match.index);
            const errorMatch = textBefore.match(/(!.+?)$/s) || textBefore.match(/(Error:.+?)$/s);
            const message = errorMatch ? errorMatch[1].trim() : "Syntax error";
            if (!errors.some(e => e.line === lineNum)) {
                errors.push({ line: lineNum, message });
            }
        }
        return errors;
    }

    function highlightErrorLines(errors) {
        if (!cm) return;
        cm.clearGutter("errors-gutter");
        cm.eachLine(lineHandle => {
            cm.removeLineClass(lineHandle, "background", "error-line-highlight");
        });
        if (!errors || errors.length === 0) return;
        errors.forEach(err => {
            const lineIndex = err.line - 1;
            if (lineIndex >= 0 && lineIndex < cm.lineCount()) {
                const marker = document.createElement("span");
                marker.className = "error-dot";
                marker.title = err.message;
                cm.setGutterMarker(lineIndex, "errors-gutter", marker);
                cm.addLineClass(lineIndex, "background", "error-line-highlight");
            }
        });
        if (errors.length > 0) {
            cm.scrollIntoView({ line: errors[0].line - 1, ch: 0 }, 100);
        }
    }

    function generateErrorSummary(errors) {
        if (!errors || errors.length === 0) return "";
        const firstError = errors[0];
        return `<div class="error-summary">
            <strong>Line ${firstError.line}:</strong> ${firstError.message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
        </div>`;
    }

    function showErrorPanel(log) {
        const compileLog = $('compileLog');
        const errorPanel = $('errorPanel');
        const errorStatusBadge = $('errorStatusBadge');

        const parsedErrors = parseErrorLines(log);
        highlightErrorLines(parsedErrors);

        if (compileLog) {
            const summaryHtml = generateErrorSummary(parsedErrors);
            compileLog.innerHTML = summaryHtml + formatCompileLog(log);
            compileLog.classList.add("has-error");
        }

        if (errorStatusBadge) {
            errorStatusBadge.querySelector('.status-text').textContent = "Errors Found";
            errorStatusBadge.style.background = "";
            errorStatusBadge.style.borderColor = "";
            errorStatusBadge.querySelector('.status-dot').style.background = "";
            errorStatusBadge.querySelector('.status-dot').style.boxShadow = "";
            errorStatusBadge.querySelector('.status-text').style.color = "";
        }

        if (errorPanel) {
            errorPanel.style.display = 'flex';
            errorPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function hideErrorPanel() {
        const compileLog = $('compileLog');
        const errorPanel = $('errorPanel');
        const errorStatusBadge = $('errorStatusBadge');

        highlightErrorLines([]);

        if (compileLog) {
            compileLog.innerHTML = "";
            compileLog.classList.remove("has-error");
        }

        if (errorStatusBadge) {
            errorStatusBadge.querySelector('.status-text').textContent = "Success";
            errorStatusBadge.style.background = "rgba(16, 185, 129, 0.2)";
            errorStatusBadge.style.borderColor = "rgba(16, 185, 129, 0.3)";
            errorStatusBadge.querySelector('.status-dot').style.background = "#10b981";
            errorStatusBadge.querySelector('.status-dot').style.boxShadow = "0 0 10px #10b981";
            errorStatusBadge.querySelector('.status-text').style.color = "#a7f3d0";
        }

        // Don't hide the panel on success, just update the status
    }

    // --- PDF RENDERING ---
    window.loadPDF = async function (url) {
        if (!url) return;

        // Normalize URL if relative
        let finalUrl = url;
        if (finalUrl.startsWith('/') && window.API_BASE) {
            finalUrl = window.API_BASE + finalUrl;
        }

        // Add internal cache buster to ensure PDF.js doesn't cache the request
        const buster = finalUrl.includes('?') ? `&t_v=${Date.now()}` : `?t_v=${Date.now()}`;
        finalUrl += buster;

        toggleSkeleton(true);

        try {
            const loadingTask = pdfjsLib.getDocument(finalUrl);
            pdfDoc = await loadingTask.promise;

            const pageCountEl = $('pageCount');
            const pageNumEl = $('pageNum');
            if (pageCountEl) pageCountEl.textContent = pdfDoc.numPages;
            if (pageNumEl) pageNumEl.textContent = 1;

            const renderSuccess = await renderAllPages();

            setTimeout(() => {
                window.updateVisualScale();
                const viewer = $('pdfViewer');
                if (viewer) viewer.scrollTop = 0;
            }, 100);

            return renderSuccess;

        } catch (err) {
            console.error('Error loading PDF:', err);
            return false;
        } finally {
            // Robust cleanup
            toggleSkeleton(false);
            const noPreviewPlaceholder = $('no-preview-placeholder');
            if (noPreviewPlaceholder) noPreviewPlaceholder.style.display = 'none';
        }
    };

    async function renderAllPages() {
        const renderId = ++currentRenderId;
        const container = $('pdfCanvasContainer');
        if (!container || !pdfDoc) return;

        container.innerHTML = '';

        for (let i = 1; i <= pdfDoc.numPages; i++) {
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
        return true;
    }

    window.updateVisualScale = function () {
        const wrapper = $('pdfViewportWrapper');
        const container = $('pdfCanvasContainer');
        const inner = $('pdfInnerContainer');
        const zoomValue = $('zoomValue');
        if (!wrapper || !container || !inner) return;

        const visualScale = currentScale / 2.0;
        wrapper.style.transform = `scale(${visualScale})`;

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

        const totalGap = (canvases.length > 1) ? (canvases.length - 1) * 30 : 0;
        inner.style.height = `${(totalH + totalGap) * visualScale + 120}px`;

        if (zoomValue) zoomValue.textContent = Math.round(currentScale * 100) + '%';
    };

    // --- BUILDER ACTIONS ---
    // --- BUILDER ACTIONS ---
    window.setupDragAndDrop = function () {
        const dropZone = $('dropZone');
        const fileInput = $('pdfInput');
        const fileNameDisplay = $('selectedFileName');

        if (!dropZone || !fileInput) return;

        // Click to browse
        dropZone.onclick = function (e) {
            if (e.target !== fileInput) {
                fileInput.click();
            }
        };

        fileInput.onchange = function () {
            if (fileInput.files.length > 0) {
                handleFileSelection(fileInput.files[0]);
            }
        };

        // Drag & Drop events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
        });

        dropZone.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                const file = files[0];
                if (file.type !== "application/pdf") {
                    window.setStatus("Only PDF files are allowed", "error");
                    return;
                }

                // Update file input manually
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;

                handleFileSelection(file);
            }
        }

        function handleFileSelection(file) {
            if (fileNameDisplay) {
                fileNameDisplay.textContent = `Selected: ${file.name}`;
                fileNameDisplay.style.display = 'block';
            }
            dropZone.classList.remove('is-empty');
            // Optional: Auto-enable upload button styling if needed
        }
    };

    window.uploadPdf = async function (fileArg) {
        const pdfInput = $('pdfInput');
        // Prefer passed argument (if any), otherwise check input
        const file = fileArg instanceof File ? fileArg : (pdfInput.files && pdfInput.files[0]);

        if (!file) {
            window.setStatus("Please select a PDF first", "warning");
            return;
        }

        const fd = new FormData();
        fd.append("pdf", file);
        fd.append("title", activeResumeTitle);

        window.showLoader('Generating LaTeX resume...');
        window.setStatus("Uploading and generating...", "loading");

        try {
            const { data: { session } } = await window._supabase.auth.getSession();
            const headers = {};
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const resp = await fetch(`${API_BASE}/api/upload`, {
                method: "POST",
                body: fd,
                headers: headers
            });
            const data = await resp.json();

            // Hide global generation loader as data (latex) has arrived
            window.hideLoader();

            if (!resp.ok) {
                // Show error panel with details
                const errorLog = data.log || data.details || data.error || "LaTeX generation failed";
                showErrorPanel(errorLog);

                // If compilation failed but we got the LaTeX code, show it in the editor (but don't save)
                if (data.latex && data.compilationFailed) {
                    // Hide overlays since we have content
                    const noResumeOverlay = $('no-resume-overlay');
                    const noPreviewPlaceholder = $('no-preview-placeholder');
                    if (noResumeOverlay) noResumeOverlay.style.display = 'none';
                    // Keep preview placeholder visible since PDF failed

                    // Show the generated LaTeX in editor so user can fix it
                    window.setEditorValue(data.latex);

                    // Parse and highlight error lines in the editor
                    const parsedErrors = parseErrorLines(errorLog);
                    highlightErrorLines(parsedErrors);
                }

                // Scroll to workspace to show error panel
                const workspace = document.querySelector('.ai-builder-workspace');
                if (workspace) workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });

                window.setStatus("Compilation failed - fix errors and recompile", "error");
                return; // Don't save to Supabase, handled gracefully
            }

            // Success - clear any previous errors
            hideErrorPanel();

            // Hide overlays as we now have content
            const noResumeOverlay = $('no-resume-overlay');
            const noPreviewPlaceholder = $('no-preview-placeholder');
            if (noResumeOverlay) noResumeOverlay.style.display = 'none';
            if (noPreviewPlaceholder) noPreviewPlaceholder.style.display = 'none';

            // Update filename if it wasn't already
            const fileNameDisplay = $('selectedFileName');
            if (fileNameDisplay && file.name) {
                fileNameDisplay.textContent = `Selected: ${file.name}`;
                fileNameDisplay.style.display = 'block';
            }

            window.setEditorValue(data.latex || "");
            latestGeneratedPdfUrl = data.pdfUrl;
            await window.loadPDF(data.pdfUrl || "/files/resume.pdf");

            window.setStatus("Compiled successfully", "success");

            // Update download button
            const downloadBtn = $('downloadBtn');
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.onclick = () => window.open(data.pdfUrl, "_blank");
            }

            // Auto-save if possible
            if (window._supabase && window._currentUser) {
                await window.saveToSupabase(data.latex, data.pdfUrl);
            }

            const workspace = document.querySelector('.ai-builder-workspace');
            if (workspace) workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (err) {
            console.error('Upload error:', err);
            showErrorPanel(err.message || "An unexpected error occurred during generation");

            // Scroll to workspace to show error panel
            const workspace = document.querySelector('.ai-builder-workspace');
            if (workspace) workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });

            window.setStatus("Generation failed", "error");
        } finally {
            // Already handled above
        }
    };

    window.recompileLatex = async function () {
        if (isCompiling) return;
        const latex = window.getEditorValue();
        if (!latex.trim()) return;

        const btn = $('recompileBtn');
        const btnContent = btn?.querySelector('.btn-content');
        const btnLoader = btn?.querySelector('.btn-loader');

        isCompiling = true;
        window.setStatus("Compiling...", "loading");

        if (btn) {
            btn.classList.add('loading');
            btn.disabled = true;
        }

        try {
            const { data: { session } } = await window._supabase.auth.getSession();
            const headers = { "Content-Type": "application/json" };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const resp = await fetch(`${API_BASE}/api/recompile`, {
                method: "POST",
                headers: headers,
                body: JSON.stringify({ latex, title: activeResumeTitle, type: 'ai' })
            });
            const data = await resp.json();

            if (!resp.ok) {
                // Use the detailed log from the server
                const errorLog = data.log || data.details || data.error || "Recompile failed";
                showErrorPanel(errorLog);
                return; // Don't throw, we handled it gracefully
            }

            // Success - clear any previous errors
            hideErrorPanel();

            latestGeneratedPdfUrl = data.pdfUrl;
            await window.loadPDF(data.pdfUrl || "/files/resume.pdf");
            originalLatexCode = latex;
            hasChanges = false;

            if (window._supabase && window._currentUser) {
                await window.saveToSupabase(latex, data.pdfUrl);
            }

            // Update download button
            const downloadBtn = $('downloadBtn');
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.onclick = () => window.open(data.pdfUrl, "_blank");
            }

            window.setStatus("Compiled successfully", "success");
        } catch (err) {
            console.error('Compilation error:', err);
            showErrorPanel(err.message || "An unexpected error occurred");
        } finally {
            isCompiling = false;
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }
    };

    let activeResumeTitle = "AI Generated Resume";

    window.setResumeTitle = function (title) {
        if (title) activeResumeTitle = title;
    };

    window.saveToSupabase = async function (latex, pdfUrl) {
        if (!window._supabase || !window._currentUser) {
            console.warn("Cannot save: Supabase or User not initialized");
            return;
        }

        try {
            // If we are editing a specific template (ATS, Minimal, etc.), save to user_resumes table
            if (window._currentTemplateField) {
                const updateData = {
                    user_id: window._currentUser.id,
                    updated_at: new Date().toISOString()
                };
                updateData[window._currentTemplateField] = latex;

                const { error } = await window._supabase
                    .from("user_resumes")
                    .upsert(updateData, { onConflict: 'user_id' });

                if (error) {
                    console.error("Template save error:", error);
                    throw error;
                }
                // console.log("Template saved to user_resumes");
            }
            // Otherwise, save to the general resumes table (for AI generated or standalone resumes)
            else {
                // Keep a timestamped URL in the database to ensure external links are fresh
                const versionedPdfUrl = pdfUrl ? (pdfUrl.includes('?') ? pdfUrl : `${pdfUrl}?v=${Date.now()}`) : null;

                const payload = {
                    user_id: window._currentUser.id,
                    title: activeResumeTitle,
                    latex_content: latex,
                    pdf_url: versionedPdfUrl,
                    updated_at: new Date().toISOString()
                };

                // console.log("Saving resume payload:", payload);

                const { data, error } = await window._supabase
                    .from("resumes")
                    .upsert(payload, { onConflict: 'user_id,title' })
                    .select();

                if (error) {
                    console.error("Resume table upsert error:", error.message, error.details, error.hint);
                    // Fallback: If onConflict fails due to missing constraint, try a normal insert or update
                    if (error.code === '42703' || error.code === '42P10') {
                        console.warn("Possible constraint or column mismatch. Check Supabase 'resumes' table structure.");
                    }
                    throw error;
                }
                // console.log("Resume saved successfully to resumes table:", data);
            }
        } catch (e) {
            console.error("Cloud save failed fundamentally:", e);
            window.setStatus && window.setStatus("Cloud save failed", "warning");
        }
    };

    window.loadLastSavedResume = async function () {
        if (!window._supabase || !window._currentUser) return;

        const noResumeOverlay = $('no-resume-overlay');
        const noPreviewPlaceholder = $('no-preview-placeholder');

        try {
            const { data } = await window._supabase
                .from("resumes")
                .select("*")
                .eq("user_id", window._currentUser.id)
                .eq("title", activeResumeTitle)
                .maybeSingle();

            if (data && data.latex_content) {
                // Hide overlays if content exists
                if (noResumeOverlay) noResumeOverlay.style.display = 'none';
                if (noPreviewPlaceholder) noPreviewPlaceholder.style.display = 'none';

                window.setEditorValue(data.latex_content);

                let success = false;
                if (data.pdf_url) {
                    success = await window.loadPDF(data.pdf_url);
                }

                // Update download button
                const downloadBtn = $('downloadBtn');
                if (downloadBtn && data.pdf_url) {
                    latestGeneratedPdfUrl = data.pdf_url;
                    downloadBtn.disabled = false;
                    downloadBtn.onclick = () => window.open(data.pdf_url, "_blank");
                }

                // If PDF fails to load or doesn't exist, recompile automatically
                if (!success && window.recompileLatex) {
                    // console.log("PDF missing or failed to load, recompiling...");
                    await window.recompileLatex();
                } else {
                    window.setStatus("Latest version loaded", "success");
                }
            } else {
                // No existing resume found, show overlays to guide user
                // console.log("No existing resume found for title:", activeResumeTitle);
                if (noResumeOverlay) noResumeOverlay.style.display = 'flex';
                if (noPreviewPlaceholder) noPreviewPlaceholder.style.display = 'flex';
                if (window.lucide) window.lucide.createIcons();
            }
        } catch (e) {
            console.warn("Load failed", e);
        }
    };

    // --- WORKSPACE LAYOUT ---
    window.setupResizer = function () {
        const resizer = $('resizer');
        const panel = document.querySelector('.editor-panel');
        // Check for either the standard editor container or the specific ai-builder-workspace class
        const container = document.querySelector('.ai-builder-workspace') || document.querySelector('.editor-container');

        if (!resizer || !panel || !container) {
            console.warn('Resizer initialization failed: Missing elements', { resizer: !!resizer, panel: !!panel, container: !!container });
            return;
        }

        let isResizing = false;

        const startResizing = () => {
            isResizing = true;
            resizer.classList.add('resizer-active');
            document.body.style.cursor = window.innerWidth <= 1147 ? 'row-resize' : 'col-resize';
            container.style.userSelect = 'none';
        };

        const doResizing = (clientX, clientY) => {
            if (!isResizing) return;
            const rect = container.getBoundingClientRect();
            if (window.innerWidth <= 1147) {
                const h = Math.max(clientY - rect.top, 100);
                panel.style.height = `${h}px`;
                panel.style.width = '100%';
            } else {
                const w = Math.min(Math.max(clientX - rect.left, rect.width * 0.2), rect.width * 0.8);
                panel.style.width = `${w}px`;
                panel.style.height = '100%';
            }
            if (cm) cm.refresh();
        };

        const stopResizing = () => {
            isResizing = false;
            resizer.classList.remove('resizer-active');
            document.body.style.cursor = '';
            container.style.userSelect = '';
        };

        const onMouseDown = (e) => startResizing();
        const onTouchStart = (e) => {
            startResizing();
            // Don't preventDefault here as it might block scroll if not on handle
        };

        const onMouseMove = (e) => doResizing(e.clientX, e.clientY);
        const onTouchMove = (e) => {
            if (isResizing && e.touches.length > 0) {
                doResizing(e.touches[0].clientX, e.touches[0].clientY);
                e.preventDefault(); // Prevent scroll while resizing
            }
        };

        const onMouseUp = () => stopResizing();
        const onTouchEnd = () => stopResizing();

        resizer.addEventListener('mousedown', onMouseDown);
        resizer.addEventListener('touchstart', onTouchStart, { passive: true });

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('touchmove', onTouchMove, { passive: false });

        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchend', onTouchEnd);

        // Initial refresh
        setTimeout(() => {
            if (cm) cm.refresh();
        }, 500);
    };

    window.restorePanelSizes = function () {
        const panel = document.querySelector('.editor-panel');
        if (!panel) return;
        if (window.innerWidth <= 1147) {
            panel.style.height = '50vh';
            panel.style.width = '100%';
        } else {
            panel.style.width = '50%';
            panel.style.height = '100%';
        }
        if (cm) cm.refresh();
    };

    function getPdfPadding() {
        return window.innerWidth <= 768 ? 20 : 120;
    }

    function fitToWidth() {
        if (!pdfDoc) return;
        const viewer = $('pdfViewer');
        if (!viewer) return;

        pdfDoc.getPage(1).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            // Available width is the viewer's current width minus padding
            const padding = 120; // Match CSS padding/gap
            const availableWidth = viewer.clientWidth - padding;
            currentScale = Math.min(availableWidth / viewport.width, 2.3);
            window.updateVisualScale();
        });
    }

    function fitToPage() {
        if (!pdfDoc) return;
        const viewer = $('pdfViewer');
        if (!viewer) return;

        pdfDoc.getPage(1).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            const padding = 60;
            const availableHeight = viewer.clientHeight - padding;
            currentScale = Math.min(availableHeight / viewport.height, 2.3);
            window.updateVisualScale();
        });
    }

    window.setupToolbarFeatures = function () {
        const zoomIn = $('zoomIn');
        const zoomOut = $('zoomOut');
        const fitWidthBtn = $('fitWidthBtn');
        const copyLinkBtn = $('copyLinkBtn');
        const pdfViewer = $('pdfViewer');
        const toggleTheme = $('toggleTheme');
        const pageNum = $('pageNum');

        if (zoomIn) {
            zoomIn.onclick = () => {
                currentScale = Math.min(currentScale + 0.1, 2.3);
                window.updateVisualScale();
            };
        }
        if (zoomOut) {
            zoomOut.onclick = () => {
                currentScale = Math.max(currentScale - 0.1, 0.4);
                window.updateVisualScale();
            };
        }

        if (toggleTheme) {
            toggleTheme.onclick = () => {
                $('pdfCanvasContainer')?.classList.toggle('pdf-dark-mode');
            };
        }

        if (fitWidthBtn) fitWidthBtn.onclick = fitToWidth;
        if (copyLinkBtn) {
            copyLinkBtn.onclick = async () => {
                if (!latestGeneratedPdfUrl) {
                    window.showToast("No PDF link available yet", "warning");
                    return;
                }
                const cleanUrl = latestGeneratedPdfUrl.split('?')[0];
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
                    console.error("Failed to copy link", err);
                    window.showToast("Failed to copy link", "error");
                }
            };
        }

        // --- Page Navigation (Scroll to page) ---
        const prevPage = $('prevPage');
        const nextPage = $('nextPage');

        if (prevPage) {
            prevPage.onclick = () => {
                const current = parseInt(pageNum.textContent);
                if (current > 1) scrollToPage(current - 1);
            };
        }

        if (nextPage) {
            nextPage.onclick = () => {
                const current = parseInt(pageNum.textContent);
                const total = parseInt($('pageCount').textContent);
                if (current < total) scrollToPage(current + 1);
            };
        }

        function scrollToPage(num) {
            const container = $('pdfCanvasContainer');
            const canvases = container.querySelectorAll('.pdf-page-canvas');
            if (canvases[num - 1]) {
                canvases[num - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
                pageNum.textContent = num;
            }
        }

        // --- PDF Interaction Logic (Mouse & Touch) ---
        if (pdfViewer) {
            // 1. Mouse Wheel (Ctrl + Wheel = Zoom)
            pdfViewer.addEventListener('wheel', (e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? -0.1 : 0.1;
                    const oldScale = currentScale;
                    currentScale = Math.min(Math.max(currentScale + delta, 0.4), 2.3);

                    const rect = pdfViewer.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    const scrollX = pdfViewer.scrollLeft;
                    const scrollY = pdfViewer.scrollTop;
                    const ratio = currentScale / oldScale;

                    window.updateVisualScale();

                    pdfViewer.scrollLeft = (scrollX + mouseX) * ratio - mouseX;
                    pdfViewer.scrollTop = (scrollY + mouseY) * ratio - mouseY;
                }
            }, { passive: false });

            // 2. Mouse Pan (Hand Tool behavior)
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

            window.addEventListener('mousemove', (e) => {
                if (!isPanning) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                pdfViewer.scrollLeft = startScrollLeft - dx;
                pdfViewer.scrollTop = startScrollTop - dy;
            });

            window.addEventListener('mouseup', () => {
                isPanning = false;
                pdfViewer.classList.remove('grabbing');
                pdfViewer.classList.add('grab');
            });

            // 3. Touch Interactions (Panning & Pinch Zoom)
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
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) e.preventDefault();
                } else if (e.touches.length === 2) {
                    e.preventDefault();
                    const currentDistance = Math.hypot(
                        e.touches[0].pageX - e.touches[1].pageX,
                        e.touches[0].pageY - e.touches[1].pageY
                    );
                    const delta = (currentDistance - lastTouchDistance) / 200;
                    if (Math.abs(delta) > 0.01) {
                        currentScale = Math.min(Math.max(currentScale + delta, 0.4), 2.3);
                        window.updateVisualScale();
                        lastTouchDistance = currentDistance;
                    }
                }
            }, { passive: false });

            pdfViewer.addEventListener('touchend', () => {
                isTouchPanning = false;
                lastTouchDistance = 0;
            });

            // Update page info on scroll
            pdfViewer.addEventListener('scroll', () => {
                const canvases = pdfViewer.querySelectorAll('.pdf-page-canvas');
                const viewerRect = pdfViewer.getBoundingClientRect();

                canvases.forEach((canvas, index) => {
                    const rect = canvas.getBoundingClientRect();
                    if (rect.top < viewerRect.bottom && rect.bottom > viewerRect.top) {
                        if (rect.top < viewerRect.top + viewerRect.height / 2) {
                            pageNum.textContent = index + 1;
                        }
                    }
                });
            });
        }
    };

    // --- ERROR PANEL CLOSE BUTTON ---
    document.addEventListener('DOMContentLoaded', () => {
        const closeErrorBtn = $('closeError');
        if (closeErrorBtn) {
            closeErrorBtn.addEventListener('click', () => {
                const errorPanel = $('errorPanel');
                if (errorPanel) errorPanel.style.display = 'none';
            });
        }
    });

})();
