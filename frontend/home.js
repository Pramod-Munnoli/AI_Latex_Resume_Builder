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

    // Initialize High-End Scroll Animations
    initScrollAnimations();

    // Initialize Word-by-Word Reveal
    initWordReveal();

    // Listen for Home/Logo clicks to re-trigger animation
    setupHomeClickListeners();
});

/**
 * Word Reveal Animation Engine
 * Splits text into words and animates them sequentially
 */
function initWordReveal() {
    // Respect user motion preferences
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const elements = document.querySelectorAll('.hero-title, .hero-subtitle');
    const heroCta = document.querySelector('.hero-cta');

    // Track total time to delay button animation
    let maxDelay = 0;

    elements.forEach((el, elementIndex) => {
        // Store original text
        if (!el.hasAttribute('data-original-text')) {
            el.setAttribute('data-original-text', el.textContent.trim());
        }

        const text = el.getAttribute('data-original-text');
        if (!text) return;

        const words = text.split(/\s+/);
        el.innerHTML = '';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.classList.remove('hero-scroll-init', 'hero-scroll-animate');

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
            const delay = baseDelay + (wordIndex * 30);
            maxDelay = Math.max(maxDelay, delay);
            setTimeout(() => {
                requestAnimationFrame(() => {
                    span.classList.add('visible');
                });
            }, delay);
        });
    });

    // 3. Animate Hero Buttons (CTA) after text finishes
    if (heroCta) {
        // Reset state and un-hide from CSS
        heroCta.classList.remove('hero-scroll-init', 'hero-scroll-animate');
        heroCta.style.visibility = 'visible';
        heroCta.style.opacity = '0';
        heroCta.style.transform = 'translateY(12px)';
        heroCta.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';

        // Appear slightly after the last word
        setTimeout(() => {
            requestAnimationFrame(() => {
                heroCta.style.opacity = '1';
                heroCta.style.transform = 'translateY(0)';
            });
        }, maxDelay + 200);
    }
}

/**
 * Re-trigger animation when clicking Home or Logo
 */
function setupHomeClickListeners() {
    const homeTriggers = document.querySelectorAll('.nav-logo, .nav-link[data-text="Home"]');

    homeTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            const isHomePage = window.location.pathname.endsWith('index.html') ||
                window.location.pathname.endsWith('/') ||
                window.location.pathname === '';

            if (isHomePage) {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });

                // Clear all visible states
                document.querySelectorAll('.word').forEach(w => w.classList.remove('visible'));
                const heroCta = document.querySelector('.hero-cta');
                if (heroCta) {
                    heroCta.style.opacity = '0';
                    heroCta.style.transform = 'translateY(12px)';
                }

                // Re-trigger the reveal sequence
                setTimeout(initWordReveal, 400);
            }
        });
    });
}

/**
 * Premium Scroll Animation Engine
 * Handles intersection observing and class toggling
 */
function initScrollAnimations() {
    // Respect user motion preferences
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;

                // Allow browser to paint before triggering layout
                requestAnimationFrame(() => {
                    if (target.classList.contains('hero-scroll-init')) {
                        target.classList.add('hero-scroll-animate');
                    } else {
                        target.classList.add('scroll-animate');
                    }
                });

                obs.unobserve(target);
            }
        });
    }, observerOptions);

    // 1. Hero Section (Strict Constraints)
    const heroElements = document.querySelectorAll('.hero-title, .hero-subtitle, .hero-cta');
    heroElements.forEach((el, index) => {
        el.classList.add('hero-scroll-init');
        // Ultra-subtle stagger sequence
        el.style.transitionDelay = `${index * 120}ms`;
        observer.observe(el);
    });

    // 2. General Sections (Title, Subtitle, Cards, Steps, Features)
    const generalSelectors = [
        '.section-title',
        '.section-subtitle',
        '.path-card',
        '.template-card',
        '.step',
        '.feature'
    ];

    const generalElements = document.querySelectorAll(generalSelectors.join(','));

    // Group elements by parent for smart staggering (e.g., grids)
    const parentMap = new Map();

    generalElements.forEach(el => {
        el.classList.add('scroll-init');

        // Check for grid parents to apply stagger
        const parent = el.parentElement;
        if (parent) {
            if (!parentMap.has(parent)) {
                parentMap.set(parent, 0);
            }
            const index = parentMap.get(parent);
            // Apply delay: 100ms per item
            el.style.transitionDelay = `${index * 100}ms`;
            parentMap.set(parent, index + 1);
        }

        observer.observe(el);
    });
}
