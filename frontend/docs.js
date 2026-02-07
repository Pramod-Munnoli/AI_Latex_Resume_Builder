document.addEventListener('DOMContentLoaded', () => {
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const sections = document.querySelectorAll('.doc-section');

    // Smooth scroll functionality already handled by theme/global if using anchors,
    // but we'll add logic for active state highlighting during scroll.

    const docsContent = document.querySelector('.docs-content');

    function updateActiveLink() {
        let currentSectionId = '';
        const scrollContainer = (window.innerWidth > 900 && docsContent) ? docsContent : window;
        const scrollPos = (scrollContainer === window) ? window.scrollY : docsContent.scrollTop;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (scrollPos >= sectionTop - 150) {
                currentSectionId = section.getAttribute('id');
            }
        });

        sidebarLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSectionId}`) {
                link.classList.add('active');
            }
        });
    }

    if (docsContent) {
        docsContent.addEventListener('scroll', updateActiveLink);
    }
    window.addEventListener('scroll', updateActiveLink);
    window.addEventListener('resize', updateActiveLink);

    // Initial check
    updateActiveLink();

    // --- Animation Engine ---
    function initAnimations() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const observerOptions = {
            root: (window.innerWidth > 900) ? docsContent : null,
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    triggerReveal(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        function triggerReveal(el) {
            if (el.tagName === 'H1') {
                revealWords(el);
            } else {
                const parent = el.parentElement;
                const indexInParent = parent ? Array.from(parent.children).indexOf(el) : 0;
                if (indexInParent < 8) {
                    el.style.transitionDelay = `${indexInParent * 60}ms`;
                }
                el.classList.add('is-visible');
            }
        }

        function revealWords(el) {
            if (el.hasAttribute('data-revealed')) return;
            el.setAttribute('data-revealed', 'true');

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

            spans.forEach((span, i) => {
                setTimeout(() => {
                    requestAnimationFrame(() => span.classList.add('visible'));
                }, i * 30);
            });
        }

        const mainHeaders = document.querySelectorAll('.doc-section h1');
        const scrollSelectors = [
            '.doc-section p', '.doc-section h3', '.doc-section ul', '.doc-section ol',
            '.callout', '.explanation-item', '.error-fix', '.faq-item', '.docs-sidebar'
        ];

        const allElements = [...mainHeaders, ...document.querySelectorAll(scrollSelectors.join(','))];

        allElements.forEach(el => {
            if (el.tagName !== 'H1') el.classList.add('scroll-animate');

            // For independent scroll, check visibility relative to docsContent
            if (window.innerWidth > 900 && docsContent) {
                const containerRect = docsContent.getBoundingClientRect();
                const elRect = el.getBoundingClientRect();
                if (elRect.top < containerRect.bottom && elRect.bottom > containerRect.top) {
                    setTimeout(() => triggerReveal(el), 100);
                } else {
                    observer.observe(el);
                }
            } else {
                const rect = el.getBoundingClientRect();
                if (rect.top < window.innerHeight && rect.bottom > 0) {
                    setTimeout(() => triggerReveal(el), 100);
                } else {
                    observer.observe(el);
                }
            }
        });
    }

    // --- Feedback Form Logic ---
    const setupFeedbackForm = () => {
        const feedbackForm = document.getElementById('feedbackForm');
        const feedbackStatus = document.getElementById('feedbackStatus');
        const submitFeedbackBtn = document.getElementById('submitFeedbackBtn');

        if (feedbackForm) {
            feedbackForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const category = document.getElementById('feedbackCategory').value;
                const message = document.getElementById('feedbackMessage').value;
                const rating = feedbackForm.querySelector('input[name="rating"]:checked')?.value;

                if (!message) return;

                // Prepare button state
                const originalBtnText = submitFeedbackBtn.innerHTML;
                submitFeedbackBtn.disabled = true;
                submitFeedbackBtn.innerHTML = '<i data-lucide="loader-2" style="animation: spin 1s linear infinite;"></i> <span>Sending...</span>';
                if (window.lucide) window.lucide.createIcons();

                try {
                    const supabase = window._supabase;
                    if (!supabase) throw new Error("Database connection not ready. Please refresh.");

                    // Get current user if any
                    const { data: { user } } = await supabase.auth.getUser();

                    const { error } = await supabase
                        .from('user_feedback')
                        .insert([{
                            user_id: user?.id || null,
                            user_email: user?.email || null,
                            category: category,
                            message: message,
                            rating: parseInt(rating) || 5,
                            metadata: {
                                browser: navigator.userAgent,
                                page: window.location.href,
                                timestamp: new Date().toISOString()
                            }
                        }]);

                    if (error) throw error;

                    // Success state
                    feedbackStatus.textContent = "Thank you! Your feedback has been submitted successfully.";
                    feedbackStatus.className = "form-status success";
                    feedbackStatus.style.display = 'block';
                    feedbackForm.reset();

                    // Reset to 5 stars visually
                    const star5 = document.getElementById('star5');
                    if (star5) star5.checked = true;

                } catch (err) {
                    console.error("Feedback error:", err);
                    feedbackStatus.textContent = "Error: " + (err.message || "Failed to submit feedback.");
                    feedbackStatus.className = "form-status error";
                    feedbackStatus.style.display = 'block';
                } finally {
                    submitFeedbackBtn.disabled = false;
                    submitFeedbackBtn.innerHTML = originalBtnText;
                    if (window.lucide) window.lucide.createIcons();

                    // Hide status after 8 seconds
                    setTimeout(() => {
                        feedbackStatus.style.display = 'none';
                        feedbackStatus.className = "form-status";
                    }, 8000);
                }
            });
        }
    };

    setupFeedbackForm();

    // Small delay to ensure browser layout is stable
    setTimeout(initAnimations, 150);
});

