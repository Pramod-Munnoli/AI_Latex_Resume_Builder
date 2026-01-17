// API Base URL configuration
const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? ""
    : "https://ai-latex-resume-builder.onrender.com";

// Store template ID mapping (template_name -> template_id)
let templateIdMap = {};

document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('templateSearch');
    const filterChips = document.querySelectorAll('.filter-chip');
    const templateCards = document.querySelectorAll('.template-card');
    const noTemplates = document.getElementById('noTemplates');

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

    // Filter templates (original functionality)
    function filterTemplates() {
        const searchTerm = searchInput.value.toLowerCase();
        const activeFilter = document.querySelector('.filter-chip.active').dataset.filter;
        let visibleCount = 0;

        templateCards.forEach(card => {
            const name = card.querySelector('.template-name').textContent.toLowerCase();
            const category = card.dataset.category;
            const matchesSearch = name.includes(searchTerm);
            const matchesFilter = activeFilter === 'all' || category === activeFilter;

            if (matchesSearch && matchesFilter) {
                card.style.display = 'block';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        noTemplates.style.display = visibleCount === 0 ? 'block' : 'none';
    }

    // Helper to show global loader
    function showLoader(message = 'Loading...') {
        const loader = document.getElementById('appLoader');
        const loaderMsg = document.getElementById('appLoaderMessage');
        if (loader) {
            if (loaderMsg) loaderMsg.textContent = message;
            loader.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    // Add click handlers to "Use Template" buttons
    function setupTemplateButtons() {
        const useTemplateButtons = document.querySelectorAll('.use-template-btn');

        useTemplateButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();

                const card = button.closest('.template-card');
                const templateName = card.dataset.templateName;
                const templateId = templateIdMap[templateName];

                if (templateId) {
                    // Show loader before redirecting
                    showLoader('Preparing your editor...');
                    // Navigate to editor with template ID
                    window.location.href = `editor.html?templateId=${templateId}&templateName=${templateName}`;
                } else {
                    console.error('Template ID not found for:', templateName);
                    alert('Failed to load template. Please refresh the page and try again.');
                }
            });
        });
    }

    // Event listeners for search and filter
    searchInput.addEventListener('input', filterTemplates);

    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterTemplates();
        });
    });

    // Load template IDs and setup buttons
    await loadTemplateIds();
    setupTemplateButtons();

    // Initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
});
