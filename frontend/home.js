document.addEventListener('DOMContentLoaded', () => {
    const authBtn = document.getElementById('authBtn');
    const authModal = document.getElementById('authModal');
    const closeBtn = document.querySelector('.close');

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
            if (targetId.startsWith('#')) {
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
});
