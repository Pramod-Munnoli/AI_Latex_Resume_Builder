/**
 * AI Chatbot Component
 * Powered by Groq Llama 3.3
 */

class AIChatbot {
    constructor() {
        this.isOpen = false;
        this.messages = [
            { role: 'bot', text: 'Hello! I\'m your AI Assistant. How can I help you with your resume today?' }
        ];
        this.init();
    }

    init() {
        this.injectStyles();
        this.createUI();
        this.attachEvents();
        this.renderMessages();
    }

    injectStyles() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/components/chatbot.css';
        document.head.appendChild(link);
    }

    createUI() {
        const container = document.createElement('div');
        container.className = 'ai-chatbot-container';
        container.innerHTML = `
            <div class="ai-chat-window" id="aiChatWindow" style="opacity: 0; visibility: hidden; display: none;">
                <div class="ai-chat-header">
                    <div class="header-info">
                        <div class="bot-avatar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                        </div>
                        <div>
                            <h3>AI Assistant</h3>
                            <div class="status">Online</div>
                        </div>
                    </div>
                    <button class="close-chat" id="closeChatBtn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="ai-chat-messages" id="aiChatMessages"></div>
                <div class="ai-chat-input-area">
                    <div class="ai-chat-input-wrapper">
                        <input type="text" id="aiChatInput" placeholder="Ask me anything..." autocomplete="off">
                    </div>
                    <button id="aiChatSend">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                </div>
            </div>
            <div class="ai-chatbot-button" id="aiChatButton" style="opacity: 0; transform: scale(0.8);">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
            </div>
        `;
        document.body.appendChild(container);

        this.window = document.getElementById('aiChatWindow');
        this.messagesContainer = document.getElementById('aiChatMessages');
        this.input = document.getElementById('aiChatInput');
        this.sendBtn = document.getElementById('aiChatSend');
        this.toggleBtn = document.getElementById('aiChatButton');
        this.closeBtn = document.getElementById('closeChatBtn');

        // Trigger entrance animation for the icon
        setTimeout(() => {
            this.toggleBtn.classList.add('entrance');
            this.toggleBtn.style.opacity = '';
            this.toggleBtn.style.transform = '';
        }, 100);
    }

    attachEvents() {
        this.toggleBtn.addEventListener('click', () => this.toggleChat());
        this.closeBtn.addEventListener('click', () => this.toggleChat());
        this.sendBtn.addEventListener('click', () => this.handleSendMessage());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSendMessage();
        });
    }

    toggleChat() {
        this.isOpen = !this.isOpen;

        if (this.isOpen) {
            // First time opening: remove the inline "display: none" so animations work
            this.window.style.display = 'flex';
            // Use a slight timeout to allow display change to register before class animation
            setTimeout(() => {
                this.window.classList.add('active');
                this.window.style.opacity = '';
                this.window.style.visibility = '';
                this.input.focus();
            }, 10);
        } else {
            this.window.classList.remove('active');
            // Wait for transition to finish before hiding again
            setTimeout(() => {
                if (!this.isOpen) {
                    this.window.style.display = 'none';
                    this.window.style.opacity = '0';
                    this.window.style.visibility = 'hidden';
                }
            }, 600);
        }
    }

    renderMessages() {
        this.messagesContainer.innerHTML = '';
        this.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message ${msg.role}`;
            div.textContent = msg.text;
            this.messagesContainer.appendChild(div);
        });
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    async handleSendMessage() {
        const text = this.input.value.trim();
        if (!text) return;

        // Add user message
        this.messages.push({ role: 'user', text });
        this.renderMessages();
        this.input.value = '';

        // Show typing indicator
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing';
        typingDiv.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
        this.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });

            const data = await response.json();

            // Remove typing indicator
            this.messagesContainer.removeChild(typingDiv);

            if (data.response) {
                this.messages.push({ role: 'bot', text: data.response });
            } else {
                this.messages.push({ role: 'bot', text: 'Sorry, I encountered an error. Please try again.' });
            }
        } catch (error) {
            console.error('Chat error:', error);
            this.messagesContainer.removeChild(typingDiv);
            this.messages.push({ role: 'bot', text: 'Connection lost. Please check your internet.' });
        }

        this.renderMessages();
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new AIChatbot());
} else {
    new AIChatbot();
}
