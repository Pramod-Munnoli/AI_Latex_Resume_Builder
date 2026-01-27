// Dashboard Logic
document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? (window.location.port === "3000" ? "" : "http://localhost:3000")
        : "https://ai-latex-resume-builder.onrender.com";

    let supabase = null;
    let currentUser = null;

    // Initialize Supabase and check authentication
    async function init() {
        try {
            const resp = await fetch(`${API_BASE}/api/config`);
            const config = await resp.json();
            supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.href = 'login.html';
                return;
            }

            currentUser = user;
            await loadDashboardData();
        } catch (err) {
            console.error("Init failed", err);
            showToast('Failed to load dashboard', 'error');
        }
    }

    // Load dashboard data
    async function loadDashboardData() {
        try {
            // Update user name
            const displayName = currentUser.user_metadata?.username ||
                currentUser.user_metadata?.full_name ||
                currentUser.email.split('@')[0];

            const formattedName = formatName(displayName);
            document.getElementById('userName').textContent = formattedName;

            // Fetch user's resume data
            const { data: userResumes, error } = await supabase
                .from('user_resumes')
                .select('*')
                .eq('user_id', currentUser.id)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            // Calculate statistics
            const stats = calculateStats(userResumes);
            updateStats(stats);
            updateEditorCard(stats);

        } catch (err) {
            console.error("Failed to load dashboard data", err);
            // Show default values on error
            updateStats({ editedCount: 0, lastEdited: null, lastUpdated: null });
        }
    }

    // Calculate statistics from user resumes
    function calculateStats(userResumes) {
        if (!userResumes) {
            return { editedCount: 0, lastEdited: null, lastUpdated: null };
        }

        const templates = [
            { name: 'ATS', field: 'ats_template_latex' },
            { name: 'Minimal', field: 'minimal_template_latex' },
            { name: 'Academic', field: 'academic_template_latex' },
            { name: 'Developer', field: 'developer_template_latex' },
            { name: 'Student', field: 'student_template_latex' }
        ];

        let editedCount = 0;
        let lastEditedTemplate = null;

        templates.forEach(template => {
            if (userResumes[template.field]) {
                editedCount++;
                lastEditedTemplate = template.name;
            }
        });

        return {
            editedCount,
            lastEdited: lastEditedTemplate,
            lastUpdated: userResumes.updated_at
        };
    }

    // Update statistics display
    function updateStats(stats) {
        document.getElementById('editedCount').textContent = stats.editedCount;
        document.getElementById('lastEditedTemplate').textContent = stats.lastEdited || 'None';

        if (stats.lastUpdated) {
            const date = new Date(stats.lastUpdated);
            document.getElementById('lastUpdated').textContent = formatDate(date);
        } else {
            document.getElementById('lastUpdated').textContent = 'Never';
        }
    }

    // Update editor card based on user's progress
    function updateEditorCard(stats) {
        const editorCardDesc = document.getElementById('editorCardDesc');
        const editorCardCta = document.getElementById('editorCardCta');

        if (stats.editedCount > 0 && stats.lastEdited) {
            editorCardDesc.textContent = `Continue editing your ${stats.lastEdited} template`;
            editorCardCta.textContent = `Open ${stats.lastEdited}`;
        } else {
            editorCardDesc.textContent = 'Start editing your first resume template';
            editorCardCta.textContent = 'Open Editor';
        }
    }

    // Handle editor button click
    const openEditorBtn = document.getElementById('openEditorBtn');
    if (openEditorBtn) {
        openEditorBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleOpenEditor();
        });
    }

    // Smart logic to open the most relevant resume
    async function handleOpenEditor() {
        try {
            setLoading(true);

            // 1. Check for AI resume first
            const { data: aiResume } = await supabase
                .from('resumes')
                .select('id')
                .eq('user_id', currentUser.id)
                .eq('title', 'AI Generated Resume')
                .maybeSingle();

            if (aiResume) {
                window.location.href = 'editor.html?template=ai';
                return;
            }

            // 2. Check for template edits
            const { data: userResumes } = await supabase
                .from('user_resumes')
                .select('*')
                .eq('user_id', currentUser.id)
                .maybeSingle();

            let templateToOpen = 'ats-modern'; // Fallback default

            if (userResumes) {
                const templates = [
                    { name: 'ats-modern', field: 'ats_template_latex' },
                    { name: 'clean-minimalist', field: 'minimal_template_latex' },
                    { name: 'academic-excellence', field: 'academic_template_latex' },
                    { name: 'tech-focused', field: 'developer_template_latex' },
                    { name: 'student', field: 'student_template_latex' }
                ];

                for (const template of templates) {
                    if (userResumes[template.field]) {
                        templateToOpen = template.name;
                        break;
                    }
                }
            }

            window.location.href = `editor.html?template=${templateToOpen}`;

        } catch (err) {
            console.error("Failed to open editor", err);
            window.location.href = 'editor.html?template=ats-modern';
        } finally {
            setLoading(false);
        }
    }

    // Helper to toggle loader
    function setLoading(loading) {
        const loader = document.getElementById('appLoader');
        if (loader) {
            if (loading) loader.classList.add('active');
            else loader.classList.remove('active');
        }
    }

    // Helper function to format name
    function formatName(name) {
        if (!name || name.includes('@')) {
            return name;
        }
        return name.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
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

    // Helper function to show toast
    function showToast(message, type = 'info') {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    // Initialize the dashboard
    async function start() {
        await init();
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    start();
});
