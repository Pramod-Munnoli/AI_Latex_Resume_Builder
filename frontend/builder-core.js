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

    // --- PDF RENDERING ---
    window.loadPDF = async function (url) {
        if (!url) return;
        const loader = $('pdfPreviewLoader');
        if (loader) loader.style.display = 'flex';

        try {
            const loadingTask = pdfjsLib.getDocument(url);
            pdfDoc = await loadingTask.promise;

            const pageCountEl = $('pageCount');
            const pageNumEl = $('pageNum');
            if (pageCountEl) pageCountEl.textContent = pdfDoc.numPages;
            if (pageNumEl) pageNumEl.textContent = 1;

            await renderAllPages();

            setTimeout(() => {
                window.updateVisualScale();
                const viewer = $('pdfViewer');
                if (viewer) viewer.scrollTop = 0;
            }, 100);

        } catch (err) {
            console.error('Error loading PDF:', err);
        } finally {
            if (loader) loader.style.display = 'none';
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
    }

    window.updateVisualScale = function () {
        const container = $('pdfCanvasContainer');
        const inner = $('pdfInnerContainer');
        const zoomValue = $('zoomValue');
        if (!container || !inner) return;

        const visualScale = currentScale / 2.0;
        container.style.transform = `scale(${visualScale})`;

        let totalH = 0;
        container.querySelectorAll('canvas').forEach(canvas => {
            totalH += (canvas.height / 2.0);
        });

        const totalGap = (container.children.length > 1) ? (container.children.length - 1) * 30 : 0;
        inner.style.height = `${(totalH + totalGap) * visualScale + 20}px`;

        if (zoomValue) zoomValue.textContent = Math.round(currentScale * 100) + '%';
    };

    // --- BUILDER ACTIONS ---
    window.uploadPdf = async function () {
        const pdfInput = $('pdfInput');
        const file = pdfInput.files && pdfInput.files[0];
        if (!file) {
            window.setStatus("Please select a PDF first", "warning");
            return;
        }

        const fd = new FormData();
        fd.append("pdf", file);

        window.showLoader('Generating LaTeX resume...');
        window.setStatus("Uploading and generating...", "loading");

        try {
            const resp = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });
            const data = await resp.json();

            if (!resp.ok) throw new Error(data.error || "Upload failed");

            window.setEditorValue(data.latex || "");
            await window.loadPDF(data.pdfUrl || "/files/resume.pdf");

            window.setStatus("Compiled successfully", "success");

            // Auto-save if possible
            if (window._supabase && window._currentUser) {
                await window.saveToSupabase(data.latex, data.pdfUrl);
            }

            const workspace = document.querySelector('.ai-builder-workspace');
            if (workspace) workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (err) {
            window.setStatus("Upload failed", "error");
            console.error(err);
        } finally {
            window.hideLoader();
        }
    };

    window.recompileLatex = async function () {
        if (isCompiling) return;
        const latex = window.getEditorValue();
        if (!latex.trim()) return;

        isCompiling = true;
        window.showLoader('Compiling LaTeX...');
        window.setStatus("Compiling...", "loading");

        try {
            const resp = await fetch(`${API_BASE}/api/recompile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ latex })
            });
            const data = await resp.json();

            if (!resp.ok) throw new Error(data.error || "Recompile failed");

            await window.loadPDF(data.pdfUrl || "/files/resume.pdf");
            originalLatexCode = latex;
            hasChanges = false;

            if (window._supabase && window._currentUser) {
                await window.saveToSupabase(latex, data.pdfUrl);
            }
            window.setStatus("Compiled successfully", "success");
        } catch (err) {
            window.setStatus("Compilation failed", "error");
        } finally {
            window.hideLoader();
            isCompiling = false;
        }
    };

    window.saveToSupabase = async function (latex, pdfUrl) {
        if (!window._supabase || !window._currentUser) return;

        try {
            let permUrl = pdfUrl;
            // logic to upload to storage if needed... (Condensed for performance)
            const { error } = await window._supabase
                .from("resumes")
                .upsert({
                    user_id: window._currentUser.id,
                    title: "My Resume",
                    latex_content: latex,
                    pdf_url: permUrl,
                    created_at: new Date().toISOString()
                }, { onConflict: 'user_id,title' });
            if (error) throw error;
        } catch (e) {
            console.warn("Cloud save failed", e);
        }
    };

    window.loadLastSavedResume = async function () {
        if (!window._supabase || !window._currentUser) return;

        try {
            const { data } = await window._supabase
                .from("resumes")
                .select("*")
                .eq("user_id", window._currentUser.id)
                .eq("title", "My Resume")
                .maybeSingle();

            if (data && data.latex_content) {
                window.setEditorValue(data.latex_content);
                if (data.pdf_url) await window.loadPDF(data.pdf_url);
                window.setStatus("Latest version loaded", "success");
            }
        } catch (e) {
            console.warn("Load failed", e);
        }
    };

    // --- WORKSPACE LAYOUT ---
    window.setupResizer = function () {
        const resizer = $('resizer');
        const panel = document.querySelector('.editor-panel');
        const container = document.querySelector('.ai-builder-workspace') || document.querySelector('.editor-container');
        if (!resizer || !panel || !container) return;

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

        resizer.onmousedown = startResizing;
        resizer.ontouchstart = (e) => { startResizing(); e.preventDefault(); };
        document.onmousemove = (e) => doResizing(e.clientX, e.clientY);
        document.ontouchmove = (e) => doResizing(e.touches[0].clientX, e.touches[0].clientY);
        document.onmouseup = stopResizing;
        document.ontouchend = stopResizing;
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

    window.setupToolbarFeatures = function () {
        const zoomIn = $('zoomIn');
        const zoomOut = $('zoomOut');
        if (zoomIn) zoomIn.onclick = () => { currentScale = Math.min(currentScale + 0.1, 2.3); window.updateVisualScale(); };
        if (zoomOut) zoomOut.onclick = () => { currentScale = Math.max(currentScale - 0.1, 0.4); window.updateVisualScale(); };

        const toggleTheme = $('toggleTheme');
        if (toggleTheme) {
            toggleTheme.onclick = () => {
                $('pdfCanvasContainer')?.classList.toggle('pdf-dark-mode');
            };
        }
    };

})();
