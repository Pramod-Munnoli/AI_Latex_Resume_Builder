// API Base URL configuration
const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? ""
    : "https://ai-latex-resume-builder.onrender.com";

// Store template ID mapping
let templateIdMap = {};

document.addEventListener('DOMContentLoaded', async () => {
    const authBtn = document.getElementById('authBtn');
    const authModal = document.getElementById('authModal');
    const closeBtn = document.querySelector('.close');

    // Fetch template IDs from database
    async function loadTemplateIds() {
        try {
            const response = await fetch(`${API_BASE}/api/templates`);
            if (!response.ok) {
                console.error('Failed to fetch template IDs:', response.status);
                return;
            }
            const data = await response.json();

            // Create mapping of template_name to template_id
            (data.templates || []).forEach(template => {
                templateIdMap[template.template_name] = template.id;
            });

            // Template IDs loaded
        } catch (error) {
            console.error('Error loading template IDs:', error);
        }
    }

    // Setup template button click handlers
    function setupTemplateButtons() {
        const useTemplateButtons = document.querySelectorAll('.use-template-btn');

        useTemplateButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const card = button.closest('.template-card');
                const templateName = card.dataset.templateName;
                const templateId = templateIdMap[templateName];

                if (templateId) {
                    // Show a nice loader if possible
                    const loader = document.getElementById('appLoader');
                    const loaderMsg = document.getElementById('appLoaderMessage');
                    if (loader && loaderMsg) {
                        loaderMsg.textContent = 'Preparing your editor...';
                        loader.classList.add('active');
                        document.body.style.overflow = 'hidden';
                    }

                    window.location.href = `editor.html?templateId=${templateId}&templateName=${templateName}`;
                } else {
                    console.error('Template ID not found for:', templateName);
                    // Minimal failover if map isn't ready
                    window.location.href = `editor.html?template=${templateName}`;
                }
            });
        });
    }

    if (authBtn && authModal) {
        authBtn.onclick = () => {
            authModal.style.display = 'block';
        };
    }

    if (closeBtn) {
        closeBtn.onclick = () => {
            authModal.style.display = 'none';
        };
    }

    window.onclick = (event) => {
        if (event.target == authModal) {
            authModal.style.display = 'none';
        }
    };

    // Smooth scroll for internal anchor links only
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            // Only smooth scroll if it's a real anchor and NOT a template button
            if (targetId.startsWith('#') && targetId !== '#' && !this.classList.contains('use-template-btn')) {
                const target = document.querySelector(targetId);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // Load template IDs and setup buttons
    await loadTemplateIds();
    setupTemplateButtons();

    // Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
});
