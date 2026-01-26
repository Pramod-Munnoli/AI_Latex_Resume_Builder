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
        await window.initSupabase((event, session) => {
            currentUser = session?.user || null;
            window._currentUser = currentUser;
        });

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

    async function loadTemplate() {
        const params = new URLSearchParams(window.location.search);
        currentTemplateName = params.get('template') || params.get('templateName');
        const noTemplateOverlay = $('no-template-overlay');
        const noPreviewPlaceholder = $('no-preview-placeholder');

        if (!currentTemplateName) {
            if (noTemplateOverlay) noTemplateOverlay.style.display = 'flex';
            if (noPreviewPlaceholder) noPreviewPlaceholder.style.display = 'flex';

            // Trigger lucide icons if any in overlays
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        if (noTemplateOverlay) noTemplateOverlay.style.display = 'none';
        if (noPreviewPlaceholder) noPreviewPlaceholder.style.display = 'none';

        window.showLoader('Loading template...');
        try {
            let code = "";

            if (currentTemplateName === 'ai') {
                if (!currentUser) {
                    window.location.href = 'login.html';
                    return;
                }
                const { data } = await window._supabase
                    .from('resumes')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .eq('title', 'My Resume')
                    .maybeSingle();

                if (data) {
                    code = data.latex_content;
                    if (data.pdf_url && window.loadPDF) {
                        window.loadPDF(data.pdf_url);
                    }
                }
            } else {
                // Fetch default and user version in parallel
                const [defaultRes, userRes] = await Promise.all([
                    window._supabase.from('latex_templates').select('latex_code').eq('template_name', currentTemplateName).single(),
                    currentUser ? window._supabase.from('user_resumes').select('*').eq('user_id', currentUser.id).maybeSingle() : Promise.resolve({ data: null })
                ]);

                code = defaultRes.data?.latex_code;
                const col = getTemplateColumn(currentTemplateName);
                if (userRes.data && userRes.data[col]) {
                    code = userRes.data[col];
                    userHasCustomVersion = true;
                    currentTemplateSource = 'user';
                } else {
                    currentTemplateSource = 'default';
                }

                // Auto-compile to generate the initial PDF preview
                if (window.recompileLatex) {
                    setTimeout(() => window.recompileLatex(), 500);
                }
            }

            if (cm && code) {
                cm.setValue(code);
                originalLatexCode = code;
                hasChanges = false;
            }

            updateTemplateUI();
        } catch (e) {
            console.error(e);
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
