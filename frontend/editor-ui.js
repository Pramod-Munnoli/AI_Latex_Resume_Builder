document.addEventListener('DOMContentLoaded', () => {
    const recompileBtn = document.getElementById('recompileBtn');
    const loadingOverlay = document.getElementById('pdfLoading');
    const errorPanel = document.getElementById('errorPanel');
    const closeError = document.getElementById('closeError');
    const downloadBtn = document.getElementById('downloadBtn');

    if (recompileBtn) {
        recompileBtn.addEventListener('click', () => {
            // Show loading state
            loadingOverlay.style.display = 'flex';
            errorPanel.style.display = 'none';

            // Simulate processing
            setTimeout(() => {
                loadingOverlay.style.display = 'none';

                // For demo purposes, we can toggle error panel if text contains "error"
                const code = document.getElementById('latexCode').value.toLowerCase();
                if (code.includes('error')) {
                    errorPanel.style.display = 'block';
                    downloadBtn.disabled = true;
                } else {
                    errorPanel.style.display = 'none';
                    downloadBtn.disabled = false;
                    // In a real app, logic to show PDF would go here
                }
            }, 1000);
        });
    }

    if (closeError) {
        closeError.addEventListener('click', () => {
            errorPanel.style.display = 'none';
        });
    }
});
