// Dashboard Logic
document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? ""
        : "https://ai-latex-resume-builder.onrender.com";

    let supabase = null;
    let currentUser = null;

    const TIPS = [
        "Keep resumes to one page for ATS optimization.",
        "Academic template suits research and university roles.",
        "Developer templates highlight your GitHub and technical stacks.",
        "Use active verbs like 'Developed' or 'Managed' for impact.",
        "Ensure your contact information is up to date.",
        "Standard fonts like Arial or Helvetica are best for ATS."
    ];

    const TEMPLATES_CONFIG = [
        { name: 'ats-modern', field: 'ats_template_latex', label: 'ATS Template' },
        { name: 'clean-minimalist', field: 'minimal_template_latex', label: 'Minimal Template' },
        { name: 'academic-excellence', field: 'academic_template_latex', label: 'Academic Template' },
        { name: 'tech-focused', field: 'developer_template_latex', label: 'Developer Template' },
        { name: 'student', field: 'student_template_latex', label: 'Student Template' }
    ];

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

            // Initialize Lucide icons
            if (window.lucide) {
                window.lucide.createIcons();
            }

            // Set a random tip
            setRandomTip();

            await loadDashboardData();
            setupEventListeners();
        } catch (err) {
            console.error("Init failed", err);
            showToast('Failed to load dashboard', 'error');
        }
    }

    function setRandomTip() {
        const tipEl = document.getElementById('proTip');
        if (tipEl) {
            const index = Math.floor(Math.random() * TIPS.length);
            tipEl.textContent = TIPS[index];
        }
    }

    async function loadDashboardData() {
        try {
            setLoading(true);

            // 1. Update user name
            const displayName = currentUser.user_metadata?.username ||
                currentUser.user_metadata?.full_name ||
                currentUser.email.split('@')[0];
            document.getElementById('userName').textContent = formatName(displayName);

            // 2. Fetch User Resumes (Templates)
            const { data: userResumes } = await supabase
                .from('user_resumes')
                .select('*')
                .eq('user_id', currentUser.id)
                .maybeSingle();

            // 3. Fetch AI Resume
            const { data: aiResume } = await supabase
                .from('resumes')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('title', 'My Resume')
                .maybeSingle();

            // 4. Calculate Stats & Identify Last Edited
            let editedCount = 0;
            let lastEdited = null; // { name, label, time }

            if (userResumes) {
                TEMPLATES_CONFIG.forEach(t => {
                    if (userResumes[t.field]) {
                        editedCount++;
                        const updatedTime = new Date(userResumes.updated_at);
                        if (!lastEdited || updatedTime > lastEdited.time) {
                            lastEdited = { name: t.name, label: t.label, time: updatedTime };
                        }
                    }
                });
            }

            // Check if AI Resume is more recent
            if (aiResume) {
                const aiTime = new Date(aiResume.created_at);
                if (!lastEdited || aiTime > lastEdited.time) {
                    lastEdited = { name: 'ai', label: 'AI Resume', time: aiTime };
                }
            }

            updateProgressUI(editedCount);
            updateHeroUI(lastEdited);

        } catch (err) {
            console.error("Dashboard data load error", err);
        } finally {
            setLoading(false);
        }
    }

    function updateProgressUI(count) {
        document.getElementById('editedCount').textContent = count;
        const progressBar = document.getElementById('progressBar');
        const percentage = (count / 5) * 100;
        progressBar.style.width = `${percentage}%`;
    }

    function updateHeroUI(lastEdited) {
        const heroTitle = document.getElementById('heroTitle');
        const heroDesc = document.getElementById('heroDesc');
        const heroMeta = document.getElementById('heroMeta');
        const lastEditedName = document.getElementById('lastEditedName');
        const lastUpdatedTime = document.getElementById('lastUpdatedTime');
        const btnText = document.querySelector('#resumeEditingBtn span');

        if (lastEdited) {
            heroTitle.textContent = "Welcome Back! 👋";
            heroDesc.textContent = "You're doing great. Continue where you left off to finish your resume.";
            lastEditedName.textContent = lastEdited.label;
            lastUpdatedTime.textContent = formatDate(lastEdited.time);
            btnText.textContent = `Continue Editing ${lastEdited.label.split(' ')[0]}`;
            heroMeta.style.display = 'block';

            // Store the target for the button
            document.getElementById('resumeEditingBtn').dataset.target = lastEdited.name;
        } else {
            heroTitle.textContent = "Start Your Journey";
            heroDesc.textContent = "You haven't started any resumes yet. Choose a template or use AI to begin.";
            heroMeta.style.display = 'none';
            btnText.textContent = "Browse Templates";
            document.getElementById('resumeEditingBtn').dataset.target = "templates";
        }
    }

    function setupEventListeners() {
        const resumeBtn = document.getElementById('resumeEditingBtn');
        if (resumeBtn) {
            resumeBtn.onclick = () => {
                const target = resumeBtn.dataset.target;
                if (target === 'templates') {
                    window.location.href = 'templates.html';
                } else if (target === 'ai') {
                    window.location.href = 'editor.html?template=ai';
                } else {
                    window.location.href = `editor.html?template=${target}`;
                }
            };
        }
    }

    // Helper functions
    function formatName(name) {
        if (!name) return 'User';
        return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }

    function formatDate(date) {
        if (!date) return 'Never';
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    function setLoading(loading) {
        const loader = document.getElementById('appLoader');
        if (loader) {
            if (loading) loader.classList.add('active');
            else loader.classList.remove('active');
        }
    }

    init();
});
