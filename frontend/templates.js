// API Base URL configuration
const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? (window.location.port === "3000" ? "" : "http://localhost:3000")
    : "https://ai-latex-resume-builder.onrender.com";

// Store template ID mapping (template_name -> template_id)
let templateIdMap = {};

document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('templateSearch');
    const filterChips = document.querySelectorAll('.filter-chip');
    const templateCards = document.querySelectorAll('.template-card');
    const noTemplates = document.getElementById('noTemplates');

    // -- Word Reveal Engine --
    function initWordReveal() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const titleElements = document.querySelectorAll('.page-title, .page-subtitle');
        let totalMaxDelay = 0;

        titleElements.forEach((el, elementIndex) => {
            const text = el.textContent.trim();
            const words = text.split(/\s+/);
            el.innerHTML = '';
            el.style.visibility = 'visible';
            el.style.opacity = '1';

            const spans = words.map(word => {
                const span = document.createElement('span');
                span.className = 'word';
                span.textContent = word;
                el.appendChild(span);
                el.appendChild(document.createTextNode(' '));
                return span;
            });

            const baseDelay = elementIndex * 400;
            spans.forEach((span, wordIndex) => {
                const delay = baseDelay + (wordIndex * 35);
                totalMaxDelay = Math.max(totalMaxDelay, delay);
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        span.classList.add('visible');
                    });
                }, delay);
            });
        });

        // Stagger in Search and Filters after text
        const nextElements = [
            document.querySelector('.search-box'),
            document.querySelector('.filter-chips')
        ];

        nextElements.forEach((el, index) => {
            if (el) {
                el.classList.add('scroll-animate');
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        el.classList.add('is-visible');
                    });
                }, totalMaxDelay + 200 + (index * 150));
            }
        });
    }

    // -- General Scroll Animation --
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe template cards
    templateCards.forEach((card, index) => {
        card.classList.add('scroll-animate');
        card.style.transitionDelay = `${(index % 4) * 100}ms`;
        observer.observe(card);
    });

    // Start Header Animations
    initWordReveal();

    // Fetch template IDs from database
    async function loadTemplateIds() {
        // console.log('[Templates] API_BASE:', API_BASE);
        try {
            const url = `${API_BASE}/api/templates`.replace(/([^:])\/\//g, '$1/');
            // console.log('[Templates] Fetching from:', url);
            const response = await fetch(url);
            if (!response.ok) {
                console.error('[Templates] Fetch failed:', response.status);
                return;
            }
            const data = await response.json();

            // Create mapping of template_name to template_id
            (data.templates || []).forEach(template => {
                templateIdMap[template.template_name] = template.id;
            });

            // console.log('[Templates] Mapping loaded:', Object.keys(templateIdMap).length);
        } catch (error) {
            console.error('[Templates] Error loading template IDs:', error);
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
                card.style.display = 'flex';
                visibleCount++;
                // If it was hidden before discovery, re-trigger observer check
                observer.observe(card);
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
                e.stopPropagation();

                const card = button.closest('.template-card');
                const templateName = card.dataset.templateName;
                const templateId = templateIdMap[templateName];

                if (templateId) {
                    // Remove global loader - editor page will show skeleton instead
                    // showLoader('Preparing your editor...');
                    // Navigate to editor with template ID
                    window.location.href = `editor.html?templateId=${templateId}&templateName=${templateName}`;
                } else {
                    console.error('Template ID not found for:', templateName);
                    // Minimal failover 
                    window.location.href = `editor.html?template=${templateName}`;
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

    // Setup buttons immediately so they are functional before the async fetch
    setupTemplateButtons();

    // Load template IDs in the background
    await loadTemplateIds();

    // Initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
});
