
const footerHTML = `
    <footer class="footer">
        <div class="footer-container">
            <div class="footer-links">
                <a href="index.html" class="footer-link">Home</a>
                <a href="templates.html" class="footer-link">Templates</a>
                <a href="ai-builder.html" class="footer-link">AI Builder</a>
                <a href="docs.html" class="footer-link">Docs</a>
                <a href="https://github.com/Pramod-Munnoli/AI_Latex_Resume_Builder" class="footer-link">GitHub</a>
            </div>
            <p class="footer-copyright">&copy; 2026 AI LaTeX Resume Builder</p>
        </div>
    </footer>
`;

// Inject Footer
function loadFooter() {
    // Check if we should omit footer (removed editor exclusion)
    const footerPlaceholder = document.getElementById('app-footer');
    if (footerPlaceholder) {
        footerPlaceholder.innerHTML = footerHTML;
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
