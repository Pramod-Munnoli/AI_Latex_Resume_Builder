// My Resumes Logic
document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? ""
        : "https://ai-latex-resume-builder.onrender.com";

    let supabase = null;
    let currentUser = null;

    // Template configuration
    const TEMPLATES = [
        {
            id: 'ats-modern',
            name: 'ATS Template',
            category: 'ats',
            icon: '📊',
            field: 'ats_template_latex',
            description: 'Optimized for applicant tracking systems'
        },
        {
            id: 'clean-minimalist',
            name: 'Minimal Template',
            category: 'minimal',
            icon: '✨',
            field: 'minimal_template_latex',
            description: 'Clean and elegant design'
        },
        {
            id: 'academic-excellence',
            name: 'Academic Template',
            category: 'academic',
            icon: '🎓',
            field: 'academic_template_latex',
            description: 'Perfect for research and academia'
        },
        {
            id: 'tech-focused',
            name: 'Developer Template',
            category: 'developer',
            icon: '💻',
            field: 'developer_template_latex',
            description: 'Tech-focused with modern design'
        },
        {
            id: 'student',
            name: 'Student/Fresher Template',
            category: 'student',
            icon: '🎒',
            field: 'student_template_latex',
            description: 'Ideal for students and freshers'
        }
    ];

    // Initialize Supabase and check authentication
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
            showToast('Failed to load resumes', 'error');
        } finally {
            setLoader(false);
        }
    }

    // Load user's resumes
    async function loadUserResumes() {
        try {
            // Fetch user's template resumes
            const { data: userResumes, error: templatesError } = await supabase
                .from('user_resumes')
                .select('*')
                .eq('user_id', currentUser.id)
                .single();

            if (templatesError && templatesError.code !== 'PGRST116') {
                throw templatesError;
            }

            // Fetch user's AI-generated resume
            const { data: aiResume, error: aiError } = await supabase
                .from('resumes')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('title', 'My Resume')
                .maybeSingle();

            if (aiError && aiError.code !== 'PGRST116') {
                console.warn('Error fetching AI resume:', aiError);
            }

            // Render templates with both data
            renderTemplates(userResumes, aiResume);

        } catch (err) {
            console.error("Failed to load user resumes", err);
            showToast('Failed to load resumes', 'error');
            renderTemplates(null, null);
        }
    }

    // Render templates grid
    function renderTemplates(userResumes, aiResume) {
        const grid = document.getElementById('templatesGrid');
        const emptyState = document.getElementById('emptyState');

        // Always show the grid with all 5 templates
        grid.style.display = 'grid';
        emptyState.style.display = 'none';

        let cardsHTML = '';

        // Add AI Resume card if it exists
        if (aiResume && aiResume.latex_content) {
            const lastUpdated = aiResume.created_at;
            cardsHTML += `
                <div class="template-card template-card-ai" data-category="ai" data-template-id="ai-resume">
                    <div class="template-header">
                        <div class="template-icon-wrapper">
                            🤖
                        </div>
                        <span class="template-status-badge status-edited">
                            AI Generated
                        </span>
                    </div>
                    
                    <div class="template-info">
                        <h3 class="template-name">AI Resume</h3>
                        <div class="template-meta">
                            <div class="template-meta-item">
                                <span class="template-meta-label">Status:</span>
                                <span>Ready to use</span>
                            </div>
                            ${lastUpdated ? `
                                <div class="template-meta-item">
                                    <span class="template-meta-label">Generated:</span>
                                    <span>${formatDate(new Date(lastUpdated))}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="template-actions">
                        <button type="button" onclick="window.location.href='editor.html?template=ai'" class="template-btn btn-open">
                            <span>📝</span>
                            Open in Editor
                        </button>
                    </div>
                </div>
            `;
        }

        // Render each template card
        cardsHTML += TEMPLATES.map(template => {
            const isEdited = userResumes && userResumes[template.field];
            const lastUpdated = userResumes?.updated_at;

            return `
                <div class="template-card" data-category="${template.category}" data-template-id="${template.id}">
                    <div class="template-header">
                        <div class="template-icon-wrapper">
                            ${template.icon}
                        </div>
                        <span class="template-status-badge ${isEdited ? 'status-edited' : 'status-not-edited'}">
                            ${isEdited ? 'Edited' : 'Not Edited'}
                        </span>
                    </div>
                    
                    <div class="template-info">
                        <h3 class="template-name">${template.name}</h3>
                        <div class="template-meta">
                            <div class="template-meta-item">
                                <span class="template-meta-label">Status:</span>
                                <span>${isEdited ? 'Ready to use' : 'Not edited yet'}</span>
                            </div>
                            ${isEdited && lastUpdated ? `
                                <div class="template-meta-item">
                                    <span class="template-meta-label">Last updated:</span>
                                    <span>${formatDate(new Date(lastUpdated))}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="template-actions">
                        ${isEdited ? `
                            <button type="button" onclick="window.location.href='editor.html?template=${template.id}'" class="template-btn btn-open">
                                <span>📝</span>
                                Open
                            </button>
                        ` : `
                            <button type="button" onclick="window.location.href='editor.html?template=${template.id}'" class="template-btn btn-use-template">
                                <span>✨</span>
                                Use Template
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML = cardsHTML;
    }

    // Helper function to format date
    function formatDate(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }

    // Helper function to show/hide loader
    function setLoader(show, msg = 'Loading...') {
        const loader = document.getElementById('appLoader');
        const loaderMessage = document.getElementById('appLoaderMessage');

        if (show) {
            loaderMessage.textContent = msg;
            loader.classList.add('active');
        } else {
            loader.classList.remove('active');
        }
    }

    // Helper function to show toast
    function showToast(message, type = 'info') {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    // Initialize the page
    init();
});
