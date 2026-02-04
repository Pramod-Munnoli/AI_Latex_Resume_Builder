const footerHTML = `
    <footer class="footer">
        <div class="footer-container">
            <div class="footer-socials">
                <a href="https://github.com/Pramod-Munnoli" target="_blank" class="social-link" title="GitHub">
                    <i data-lucide="github"></i>
                </a>
                <a href="https://www.linkedin.com/in/pramod-munnoli/" target="_blank" class="social-link" title="LinkedIn">
                    <i data-lucide="linkedin"></i>
                </a>
                <a href="https://www.instagram.com/pramod_munnoli_09" target="_blank" class="social-link" title="Instagram">
                    <i data-lucide="instagram"></i>
                </a>
                <a href="https://twitter.com/MunnoliPra85078" target="_blank" class="social-link" title="Twitter">
                    <i data-lucide="twitter"></i>
                </a>
                <a href="mailto:pramodmunnoli99@gmail.com" class="social-link" title="Email Me">
                    <i data-lucide="mail"></i>
                </a>
            </div>
            <div class="footer-links">
                <a href="index.html" class="footer-link">Home</a>
                <a href="templates.html" class="footer-link">Templates</a>
                <a href="ai-builder.html" class="footer-link">AI Builder</a>
                <a href="docs.html" class="footer-link">Docs</a>
                <a href="https://github.com/Pramod-Munnoli/AI_Latex_Resume_Builder" target="_blank" class="footer-link">Project Repo</a>
            </div>
            <p class="footer-copyright">&copy; 2026 AI LaTeX Resume Builder | Developed by Pramod Munnoli</p>
        </div>
    </footer>
`;

// Inject Footer
function loadFooter() {
    // Check if we should omit footer (removed editor exclusion)
    const footerPlaceholder = document.getElementById('app-footer');
    if (footerPlaceholder) {
        footerPlaceholder.innerHTML = footerHTML;
        // Re-run lucide to render new icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // Inject Chatbot (On all pages)
    if (!document.getElementById('ai-chatbot-script')) {
        const chatScript = document.createElement('script');
        chatScript.id = 'ai-chatbot-script';
        chatScript.src = 'components/chatbot.js';
        chatScript.defer = true;
        document.body.appendChild(chatScript);
    }
}

// Execute immediately if placeholder exists, or on load
if (document.getElementById('app-footer')) {
    loadFooter();
} else {
    document.addEventListener('DOMContentLoaded', loadFooter);
}
