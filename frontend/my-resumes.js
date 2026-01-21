// My Resumes Logic
document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? ""
        : "https://ai-latex-resume-builder.onrender.com";

    let supabase = null;
    let currentUser = null;

    // Template configuration
    const TEMPLATES = [
        { id: 'ats-modern', name: 'ATS Template', icon: '📊', field: 'ats_template_latex', category: 'Professional' },
        { id: 'clean-minimalist', name: 'Minimal Template', icon: '✨', field: 'minimal_template_latex', category: 'Modern' },
        { id: 'academic-excellence', name: 'Academic Template', icon: '🎓', field: 'academic_template_latex', category: 'Academic' },
        { id: 'tech-focused', name: 'Developer Template', icon: '💻', field: 'developer_template_latex', category: 'Technical' },
        { id: 'student', name: 'Student Template', icon: '📝', field: 'student_template_latex', category: 'Entry-level' }
    ];

    async function init() {
        try {
            setLoader(true, 'Loading your resumes...');
            const resp = await fetch(`${API_BASE}/api/config`);
            const config = await resp.json();
            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.href = 'login.html';
                return;
            }

            currentUser = user;
            await loadUserResumes();
        } catch (err) {
            console.error("Init failed", err);
            showToast('Failed to load. Please refresh.', 'error');
        } finally {
            setLoader(false);
        }
    }

    async function loadUserResumes() {
        try {
            // Fetch template data
            const { data: userResumes } = await supabase
                .from('user_resumes')
                .select('*')
                .eq('user_id', currentUser.id)
                .maybeSingle();

            // Fetch AI resume
            const { data: aiResume } = await supabase
                .from('resumes')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('title', 'My Resume')
                .maybeSingle();

            renderTemplates(userResumes, aiResume);
        } catch (err) {
            console.error("Load resumes failed", err);
        }
    }

    function renderTemplates(userResumes, aiResume) {
        const grid = document.getElementById('templatesGrid');
        const emptyState = document.getElementById('emptyState');

        // Prepare template data with status
        let processedTemplates = TEMPLATES.map(t => {
            const content = userResumes ? userResumes[t.field] : null;
            return {
                ...t,
                isEdited: !!content,
                updated_at: content ? userResumes.updated_at : null
            };
        });

        // Sorting Logic: 
        // 1. Last edited (most recent updated_at)
        // 2. Others edited
        // 3. Not edited
        processedTemplates.sort((a, b) => {
            if (a.isEdited && !b.isEdited) return -1;
            if (!a.isEdited && b.isEdited) return 1;
            if (a.isEdited && b.isEdited) {
                return new Date(b.updated_at) - new Date(a.updated_at);
            }
            return 0;
        });

        const anyEdited = processedTemplates.some(t => t.isEdited) || (aiResume && aiResume.latex_content);

        if (!anyEdited) {
            grid.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        grid.style.display = 'grid';
        emptyState.style.display = 'none';

        let cardsHTML = '';

        // Add AI Resume card first if it exists
        if (aiResume && aiResume.latex_content) {
            cardsHTML += renderCard({
                id: 'ai',
                name: 'AI Generated Resume',
                icon: '🤖',
                isEdited: true,
                updated_at: aiResume.created_at,
                isAI: true
            });
        }

        cardsHTML += processedTemplates.map(t => renderCard(t)).join('');
        grid.innerHTML = cardsHTML;
    }

    function renderCard(template) {
        const dateStr = template.updated_at ? formatDate(new Date(template.updated_at)) : '';
        const statusClass = template.isAI ? 'status-ai' : (template.isEdited ? 'status-edited' : 'status-new');
        const statusLabel = template.isAI ? 'AI Ready' : (template.isEdited ? 'Edited' : 'Not Started');

        return `
            <div class="template-card ${template.isAI ? 'ai-glow' : ''}" data-id="${template.id}">
                <div class="card-header">
                    <div class="card-icon">${template.icon}</div>
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                </div>
                <div class="card-body">
                    <h3 class="template-name">${template.name}</h3>
                    <div class="template-meta">
                        ${template.isEdited ? `<span>Updated ${dateStr}</span>` : '<span>Original Template</span>'}
                    </div>
                </div>
                <div class="card-actions">
                    <button onclick="openTemplate('${template.id}')" class="btn btn-primary-sm">
                        ${template.isEdited ? 'Open Editor' : 'Start from Template'}
                    </button>
                    ${template.isEdited && !template.isAI ? `
                        <button onclick="confirmReset('${template.id}', '${template.name}')" class="btn btn-reset-sm" title="Reset to default">
                            <i data-lucide="rotate-ccw"></i> Reset
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Global action handlers
    window.openTemplate = (id) => {
        setLoader(true, 'Opening editor...');
        window.location.href = `editor.html?template=${id}`;
    };

    window.confirmReset = async (id, name) => {
        const modal = document.getElementById('confirmResetModal');
        const msgEl = document.getElementById('confirmResetMessage');
        const confirmBtn = document.getElementById('confirmResetBtn');
        const cancelBtn = document.getElementById('cancelResetBtn');

        if (!modal || !confirmBtn || !cancelBtn) {
            // Fallback to native if modal missing
            if (!confirm(`Are you sure you want to reset the ${name}? This will only affect this specific template.`)) return;
            executeReset(id, name);
            return;
        }

        // Set more specific and reassuring message
        msgEl.innerHTML = `Are you sure you want to reset the <strong>${name}</strong>?<br><span style="font-size: 0.9em; opacity: 0.8; margin-top: 8px; display: block;">This will only discard edits for this template. Your other resumes will remain safe and untouched.</span>`;
        modal.style.display = 'flex';

        confirmBtn.onclick = async () => {
            modal.style.display = 'none';
            await executeReset(id, name);
        };

        cancelBtn.onclick = () => {
            modal.style.display = 'none';
        };
    };

    async function executeReset(id, name) {
        try {
            setLoader(true, `Resetting ${name}...`);

            const template = TEMPLATES.find(t => t.id === id);
            if (!template) {
                showToast('Template configuration not found', 'error');
                return;
            }

            // Perform partial update on the specific column only
            const { error } = await supabase
                .from('user_resumes')
                .update({
                    [template.field]: null
                    // Note: Row updated_at will change, but content in other columns is preserved
                })
                .eq('user_id', currentUser.id);

            if (error) throw error;

            showToast(`${name} has been reset to default`, 'success');
            await loadUserResumes();
        } catch (err) {
            console.error("Reset failed", err);
            showToast(`Failed to reset ${name}`, 'error');
        } finally {
            setLoader(false);
        }
    }

    // Modal Helper
    window.showCustomAlert = (message) => {
        const modal = document.getElementById('customAlertModal');
        const msgEl = document.getElementById('alertModalMessage');
        const okBtn = document.getElementById('alertModalOkBtn');

        if (modal && msgEl && okBtn) {
            msgEl.textContent = message;
            modal.style.display = 'flex';
            okBtn.onclick = () => modal.style.display = 'none';
        } else {
            alert(message);
        }
    };

    function formatDate(date) {
        if (!date) return '';
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    function setLoader(show, msg = 'Loading...') {
        const loader = document.getElementById('appLoader');
        const loaderMsg = document.getElementById('appLoaderMessage');
        if (loader) {
            if (show) {
                if (loaderMsg) loaderMsg.textContent = msg;
                loader.classList.add('active');
            } else {
                loader.classList.remove('active');
            }
        }
    }

    function showToast(msg, type) {
        if (window.showToast) window.showToast(msg, type);
        else console.log(`[${type}] ${msg}`);
    }

    init();
});
