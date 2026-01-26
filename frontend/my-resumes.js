// My Resumes Logic
document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? (window.location.port === "3000" ? "" : "http://localhost:3000")
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

            // Use shared initSupabase from auth-core.js
            await window.initSupabase((event, session) => {
                // Optional: handle real-time auth changes if needed
            });

            supabase = window._supabase;
            if (!supabase) throw new Error("Supabase not initialized");

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

    // Expose functions to window for onclick handlers
    window.deleteAiResume = async (id) => {
        if (!confirm('Are you sure you want to delete this AI Generated resume? This cannot be undone.')) return;

        try {
            setLoader(true, 'Deleting...');
            const { error } = await supabase
                .from('resumes')
                .delete()
                .eq('id', id);

            if (error) throw error;

            showToast('Resume deleted successfully', 'success');
            await loadUserResumes(); // Reload list
        } catch (err) {
            console.error('Delete failed', err);
            showToast('Failed to delete resume', 'error');
        } finally {
            setLoader(false);
        }
    };

    window.resetTemplate = async (field) => {
        if (!confirm('Are you sure you want to reset this template? Your customizations will be lost.')) return;

        try {
            setLoader(true, 'Resetting template...');

            const updateData = {};
            updateData[field] = null;

            const { error } = await supabase
                .from('user_resumes')
                .update(updateData)
                .eq('user_id', currentUser.id);

            if (error) throw error;

            showToast('Template reset successfully', 'success');
            await loadUserResumes();
        } catch (err) {
            console.error('Reset failed', err);
            showToast('Failed to reset template', 'error');
        } finally {
            setLoader(false);
        }
    };

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
                <div class="template-card" data-category="ai" data-template-id="ai-resume">
                    <div class="template-header">
                        <div class="template-icon-wrapper">
                            <i data-lucide="brain-circuit"></i>
                        </div>
                        <span class="template-status-badge status-edited">
                            AI Generated
                        </span>
                    </div>
                    
                    <div class="template-info">
                        <h3 class="template-name">AI Resume</h3>
                        <div class="template-meta">
                            <div class="template-meta-item">
                                <i data-lucide="check-circle-2"></i>
                                <span class="template-meta-label">Status:</span>
                                <span>Ready to use</span>
                            </div>
                            ${lastUpdated ? `
                                <div class="template-meta-item">
                                    <i data-lucide="calendar"></i>
                                    <span class="template-meta-label">Generated:</span>
                                    <span>${formatDate(new Date(lastUpdated))}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="template-actions">
                        <button type="button" onclick="window.location.href='editor.html?template=ai'" class="template-btn btn-open">
                            <i data-lucide="edit-3"></i>
                            Open in Editor
                        </button>
                        <button type="button" onclick="deleteAiResume('${aiResume.id}')" class="template-btn btn-reset" title="Delete Resume">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        // Render each template card
        const categoryIcons = {
            'ats': 'bar-chart-3',
            'minimal': 'sparkles',
            'academic': 'graduation-cap',
            'developer': 'code-2',
            'student': 'briefcase'
        };

        cardsHTML += TEMPLATES.map(template => {
            const isEdited = userResumes && userResumes[template.field];
            const lastUpdated = userResumes?.updated_at;
            const lucideIcon = categoryIcons[template.category] || 'file-text';

            return `
                <div class="template-card" data-category="${template.category}" data-template-id="${template.id}">
                    <div class="template-header">
                        <div class="template-icon-wrapper">
                            <i data-lucide="${lucideIcon}"></i>
                        </div>
                        <span class="template-status-badge ${isEdited ? 'status-edited' : 'status-not-edited'}">
                            ${isEdited ? 'Edited' : 'Not Edited'}
                        </span>
                    </div>
                    
                    <div class="template-info">
                        <h3 class="template-name">${template.name}</h3>
                        <div class="template-meta">
                            <div class="template-meta-item">
                                <i data-lucide="${isEdited ? 'check-circle-2' : 'circle'}"></i>
                                <span class="template-meta-label">Status:</span>
                                <span>${isEdited ? 'Ready to use' : 'Not edited yet'}</span>
                            </div>
                            ${isEdited && lastUpdated ? `
                                <div class="template-meta-item">
                                    <i data-lucide="clock"></i>
                                    <span class="template-meta-label">Last updated:</span>
                                    <span>${formatDate(new Date(lastUpdated))}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="template-actions">
                        <button type="button" onclick="window.location.href='editor.html?template=${template.id}'" class="template-btn ${isEdited ? 'btn-open' : 'btn-use-template'}">
                            <i data-lucide="${isEdited ? 'edit-3' : 'zap'}"></i>
                            ${isEdited ? 'Open' : 'Use Template'}
                        </button>
                        ${isEdited ? `
                        <button type="button" onclick="resetTemplate('${template.field}')" class="template-btn btn-reset" title="Reset Template">
                            <i data-lucide="rotate-ccw"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML = cardsHTML;

        // Initialize Lucide icons after rendering
        if (window.lucide) {
            window.lucide.createIcons();
        }
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
            if (loaderMessage) loaderMessage.textContent = msg;
            if (loader) loader.classList.add('active');
        } else {
            if (loader) loader.classList.remove('active');
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

    // Initialize filters
    function initFilters() {
        const filterTags = document.querySelectorAll('.filter-tag');

        filterTags.forEach(tag => {
            tag.addEventListener('click', () => {
                const filter = tag.getAttribute('data-filter');

                // Update active state
                filterTags.forEach(t => t.classList.remove('active'));
                tag.classList.add('active');

                // Automatic Horizontal Scroll (Mobile/Small Screens only)
                if (window.innerWidth <= 768) {
                    const container = tag.parentElement;
                    if (container) {
                        const scrollLeft = tag.offsetLeft - (container.clientWidth / 2) + (tag.clientWidth / 2);
                        container.scrollTo({
                            left: scrollLeft,
                            behavior: 'smooth'
                        });
                    }
                }

                // Filter cards
                const cards = document.querySelectorAll('.template-card');
                let foundMatch = false;

                cards.forEach(card => {
                    const category = card.getAttribute('data-category');
                    if (filter === 'all' || category === filter) {
                        card.style.display = 'flex';
                        foundMatch = true;
                    } else {
                        card.style.display = 'none';
                    }
                });

                // Handle empty search results visually if needed
                const emptyState = document.getElementById('emptyState');
                if (!foundMatch) {
                    emptyState.style.display = 'block';
                    // Update empty state text for the specific filter
                    const emptyTitle = emptyState.querySelector('.empty-state-title');
                    if (emptyTitle) emptyTitle.textContent = `No ${tag.textContent} Resumes`;
                } else {
                    // Check if it's the global empty state (no resumes at all)
                    // If we have cards in the DOM, foundMatch would have been true if any matched
                    // but we need to know if the user actually has resumes.
                    // This logic is mostly for UI feedback when filtering.
                    emptyState.style.display = 'none';
                }
            });
        });
    }

    // Initialize the page
    async function start() {
        await init();
        initFilters();
    }

    start();
});
