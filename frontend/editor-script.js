/**
 * editor-script.js - Optimized Editor Logic
 * Dependencies: common.js, auth-core.js, builder-core.js (partial)
 */

(function () {
    "use strict";

    // Use globals from common.js ($, API_BASE, applyTheme, etc.)

    // State variables
    let currentTemplateId = null;
    let currentTemplateName = null;
    let originalLatexCode = "";
    let hasChanges = false;
    let currentUser = null;
    let cm = null;
    let currentTemplateSource = null; // 'user' or 'default'
    let userHasCustomVersion = false;
    let isCompiling = false;

    // --- TEMPLATE UTILS ---
    function getTemplateColumn(templateName) {
        const mapping = {
            'ats-modern': 'ats_template_latex',
            'clean-minimalist': 'minimal_template_latex',
            'academic-excellence': 'academic_template_latex',
            'tech-focused': 'developer_template_latex',
            'student': 'student_template_latex'
        };
        return mapping[templateName];
    }

    // --- INITIALIZATION ---
    async function init() {
        window.initLoader();

        // Use shared Supabase init
        const supabase = await window.initSupabase((event, session) => {
            currentUser = session?.user || null;
            window._currentUser = currentUser;
        });

        // CRITICAL: Explicitly get session before loading template 
        // to avoid race conditions where currentUser is null during first load
        try {
            const { data: { session } } = await supabase.auth.getSession();
            currentUser = session?.user || null;
            window._currentUser = currentUser;
        } catch (err) {
            console.warn("Session fetch failed", err);
        }

        if (window.initCodeMirror) {
            window.initCodeMirror();
            cm = window._cm; // Sync with global instance
        } else {
            initLocalCodeMirror();
        }

        if (window.setupToolbarFeatures) window.setupToolbarFeatures();

        await loadTemplate();

        if (window.setupResizer) window.setupResizer();
        if (window.restorePanelSizes) window.restorePanelSizes();

        // Ensure visibility
        const container = document.querySelector('.editor-container');
        if (container) {
            setTimeout(() => {
                container.classList.add('panels-visible');
            }, 100);
        }

        setupEditorListeners();
    }

    function initLocalCodeMirror() {
        const latexEditor = $('latexEditor');
        if (!latexEditor) return;
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const cmTheme = currentTheme === 'light' ? 'default' : 'dracula';

        cm = CodeMirror.fromTextArea(latexEditor, {
            mode: "stex", theme: cmTheme, lineNumbers: true, lineWrapping: true,
            tabSize: 4, indentUnit: 4, viewportMargin: Infinity
        });

        cm.on('change', () => {
            hasChanges = (cm.getValue() !== originalLatexCode);
            $('recompileBtn').disabled = !cm.getValue().trim();
        });
        cm.setSize("100%", "100%");
    }

    /**
     * ADVANCED CONTENT LOADER - State Isolation Rewrite
     * Strictly isolates AI resumes from Template resumes to prevent cross-contamination.
     */
    async function loadTemplate() {
        console.log("[EDITOR] Initiating Deep Reset...");

        // 1. PHYSICAL STATE ISOLATION
        if (cm) {
            cm.setValue("");
            cm.clearHistory();
        }

        // Wipe all global routing flags
        window._currentTemplateField = null;
        window._currentTemplateName = null;
        userHasCustomVersion = false;
        hasChanges = false;
        originalLatexCode = "";

        // Identify target from URL
        const params = new URLSearchParams(window.location.search);
        const rawTarget = params.get('template') || params.get('templateName') || "";
        const target = rawTarget.trim();

        const noOverlay = $('no-template-overlay');
        const noPreview = $('no-preview-placeholder');

        if (!target) {
            console.log("[EDITOR] No target resume specified in URL.");
            if (noOverlay) noOverlay.style.display = 'flex';
            if (noPreview) noPreview.style.display = 'flex';
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        if (noOverlay) noOverlay.style.display = 'none';
        if (noPreview) noPreview.style.display = 'none';

        window.showLoader('Initializing Isolated Workspace...');

        try {
            let finalizedCode = "";
            const isAI = target.toLowerCase() === 'ai' || target.toLowerCase() === 'ai-resume' || target === 'AI Generated Resume';

            // --- BRANCH A: AI RESUME (Resumes Table) ---
            if (isAI) {
                console.log("[EDITOR] Entering AI MODE - Table: 'resumes'");

                if (!currentUser) {
                    window.location.href = 'login.html';
                    return;
                }

                // Lock logic for AI mode
                if (window.setResumeTitle) window.setResumeTitle('AI Generated Resume');
                window._currentTemplateField = null; // Ensuring no template field is set (Critical)

                const { data, error } = await window._supabase
                    .from('resumes')
                    .select('latex_content, pdf_url')
                    .eq('user_id', currentUser.id)
                    .eq('title', 'AI Generated Resume')
                    .maybeSingle();

                if (error) throw error;
                if (data) {
                    finalizedCode = data.latex_content;
                    if (data.pdf_url && window.loadPDF) {
                        await window.loadPDF(data.pdf_url);
                    }
                }
            }
            // --- BRANCH B: STANDARD TEMPLATE (Template Table) ---
            else {
                console.log(`[EDITOR] Entering TEMPLATE MODE: ${target} - Table: 'user_resumes'`);

                const col = getTemplateColumn(target);
                if (!col) {
                    throw new Error(`Template '${target}' is not recognized correctly.`);
                }

                // Explicitly lock to Template Table column
                window._currentTemplateField = col;
                window._currentTemplateName = target;
                if (window.setResumeTitle) window.setResumeTitle('My Resume');

                const [defaultRes, userRes] = await Promise.all([
                    window._supabase.from('latex_templates').select('latex_code').eq('template_name', target).single(),
                    currentUser ? window._supabase.from('user_resumes').select('*').eq('user_id', currentUser.id).maybeSingle() : Promise.resolve({ data: null })
                ]);

                finalizedCode = defaultRes.data?.latex_code;

                if (userRes.data && userRes.data[col]) {
                    finalizedCode = userRes.data[col];
                    userHasCustomVersion = true;
                    currentTemplateSource = 'user';
                } else {
                    currentTemplateSource = 'default';
                }

                // Auto-compile template for preview
                if (window.recompileLatex) {
                    setTimeout(() => window.recompileLatex(), 300);
                }
            }

            // 3. FINAL SYNC - Apply code to clean editor
            if (cm && finalizedCode) {
                cm.setValue(finalizedCode);
                originalLatexCode = finalizedCode;
                hasChanges = false;
                cm.clearHistory();
                console.log("[EDITOR] Workspace isolation complete.");
            }

            updateTemplateUI();
        } catch (e) {
            console.error("[EDITOR_FATAL]", e);
            window.showToast("Critical Error loading resume content", "error");
        } finally {
            window.hideLoader();
        }
    }

    function updateTemplateUI() {
        const display = $('template-name-display');
        if (display && currentTemplateName) {
            display.textContent = currentTemplateName.replace(/-/g, ' ').toUpperCase();
            display.style.display = 'block';
        }
    }

    function setupEditorListeners() {
        $('recompileBtn')?.addEventListener('click', async () => {
            if (window.recompileLatex) await window.recompileLatex();
        });

        $('downloadBtn')?.addEventListener('click', () => {
            window.open(`${API_BASE}/api/download`, "_blank");
        });

        $('alertModalOkBtn')?.addEventListener('click', () => {
            $('customAlertModal').style.display = 'none';
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
