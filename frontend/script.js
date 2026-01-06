
(function () {
    "use strict";

    function $(id) { return document.getElementById(id); }

    const pdfInput = $("pdfInput");
    const uploadBtn = $("uploadBtn");
    const statusEl = $("status");
    const latexEditor = $("latexEditor");
    const recompileBtn = $("recompileBtn");
    const downloadBtn = $("downloadBtn");
    const compileLog = $("compileLog");
    const pdfFrame = $("pdfFrame");
    const toastContainer = $("toastContainer");

    // Toast notification system
    function showToast(title, message, type = "info") {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        const icons = {
            success: "✓",
            error: "✕",
            warning: "⚠",
            info: "ℹ"
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ""}
            </div>
        `;

        toastContainer.appendChild(toast);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.classList.add("toast-hiding");
            setTimeout(() => {
                if (toast.parentNode) {
                    toastContainer.removeChild(toast);
                }
            }, 300);
        }, 5000);
    }

    // Enhanced status update with type
    function setStatus(msg, type = "ready") {
        statusEl.textContent = msg;
        statusEl.className = `status status-${type}`;
    }

    function setLoading(isLoading) {
        uploadBtn.disabled = isLoading;
        recompileBtn.disabled = isLoading || !latexEditor.value.trim();
        downloadBtn.disabled = isLoading;
    }

    function setPdfSrc(url) {
        if (!url) return;
        const bust = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
        pdfFrame.setAttribute("src", bust);
    }

    // Error categorization and user-friendly messages
    function getErrorInfo(data, defaultMessage) {
        const errorCode = data?.code || "";
        const errorMessage = data?.error || defaultMessage;
        const errorDetails = data?.details || "";

        // Map error codes to user-friendly messages
        const errorMap = {
            "NO_FILE": {
                title: "No File Selected",
                message: "Please select a PDF file before uploading.",
                type: "warning"
            },
            "INVALID_FILE_TYPE": {
                title: "Invalid File Type",
                message: "Only PDF files are supported. Please select a valid PDF.",
                type: "error"
            },
            "FILE_TOO_LARGE": {
                title: "File Too Large",
                message: "Maximum file size is 20MB. Please use a smaller PDF.",
                type: "error"
            },
            "PDF_EXTRACTION_FAILED": {
                title: "Cannot Extract Text",
                message: "The PDF appears to be empty or image-based. Please use a PDF with selectable text.",
                type: "error"
            },
            "AI_SERVICE_ERROR": {
                title: "AI Service Unavailable",
                message: "The AI service is temporarily unavailable. Please try again in a few moments.",
                type: "warning"
            },
            "LATEX_COMPILATION_FAILED": {
                title: "LaTeX Compilation Error",
                message: errorDetails || "There was an error compiling the LaTeX. Check the compile log for details.",
                type: "error"
            },
            "INVALID_LATEX": {
                title: "Invalid LaTeX",
                message: "Please enter valid LaTeX code before recompiling.",
                type: "warning"
            },
            "EMPTY_LATEX": {
                title: "Empty Editor",
                message: "The LaTeX editor is empty. Please add content before compiling.",
                type: "warning"
            }
        };

        if (errorCode && errorMap[errorCode]) {
            return errorMap[errorCode];
        }

        // Default error info
        return {
            title: errorMessage,
            message: errorDetails || "An unexpected error occurred. Please try again.",
            type: "error"
        };
    }

    async function uploadPdf() {
        const file = pdfInput.files && pdfInput.files[0];
        if (!file) {
            setStatus("Please select a PDF first", "warning");
            showToast("No File Selected", "Please select a PDF file to upload.", "warning");
            return;
        }

        const fd = new FormData();
        fd.append("pdf", file);

        setLoading(true);
        setStatus("Uploading and generating LaTeX...", "loading");
        compileLog.textContent = "";
        compileLog.classList.remove("has-error");

        try {
            const resp = await fetch("/api/upload", { method: "POST", body: fd });
            const data = await resp.json();

            if (!resp.ok) {
                const errorInfo = getErrorInfo(data, "Upload failed");
                throw { info: errorInfo, data };
            }

            latexEditor.value = (data.latex || "").trim();
            setPdfSrc(data.pdfUrl || "/files/resume.pdf");

            setStatus("Compiled successfully", "success");
            showToast("Success!", "Resume generated successfully.", "success");

            recompileBtn.disabled = !latexEditor.value.trim();
            downloadBtn.disabled = false;

            if (!compileLog.textContent) {
                compileLog.textContent = "Initial compile completed successfully.";
            }
        } catch (err) {
            setStatus("Upload failed", "error");
            compileLog.classList.add("has-error");

            if (err.info) {
                showToast(err.info.title, err.info.message, err.info.type);
                compileLog.textContent = err.data?.details || err.info.message;
            } else if (err.message) {
                showToast("Upload Failed", err.message, "error");
                compileLog.textContent = err.message;
            } else {
                showToast("Upload Failed", "An unexpected error occurred.", "error");
                compileLog.textContent = "Upload processing failed. Please try again.";
            }
        } finally {
            setLoading(false);
        }
    }

    async function recompileLatex() {
        const latex = latexEditor.value || "";
        if (!latex.trim()) {
            setStatus("Enter LaTeX before recompiling", "warning");
            showToast("Empty Editor", "Please enter LaTeX code before recompiling.", "warning");
            return;
        }

        setLoading(true);
        setStatus("Compiling LaTeX...", "loading");
        compileLog.classList.remove("has-error");

        try {
            const resp = await fetch("/api/recompile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ latex })
            });
            const data = await resp.json();

            if (!resp.ok) {
                const errorInfo = getErrorInfo(data, "Recompile failed");
                throw { info: errorInfo, data };
            }

            setPdfSrc(data.pdfUrl || "/files/resume.pdf");
            compileLog.textContent = (data.log || "Compilation successful.").trim();
            setStatus("Compiled successfully", "success");
            showToast("Success!", "LaTeX compiled successfully.", "success");
            downloadBtn.disabled = false;
        } catch (err) {
            setStatus("Compilation failed", "error");
            compileLog.classList.add("has-error");

            if (err.info) {
                showToast(err.info.title, err.info.message, err.info.type);
                compileLog.textContent = err.data?.log || err.data?.details || err.info.message;
            } else if (err.message) {
                showToast("Compilation Failed", err.message, "error");
                compileLog.textContent = err.message;
            } else {
                showToast("Compilation Failed", "An unexpected error occurred.", "error");
                compileLog.textContent = "Recompile failed. Please check your LaTeX syntax.";
            }
        } finally {
            setLoading(false);
        }
    }

    function downloadPdf() {
        window.open("/api/download", "_blank");
    }

    function init() {
        setStatus("Ready", "ready");
        recompileBtn.disabled = true;
        downloadBtn.disabled = true;

        uploadBtn.addEventListener("click", uploadPdf);
        recompileBtn.addEventListener("click", recompileLatex);
        downloadBtn.addEventListener("click", downloadPdf);

        pdfInput.addEventListener("change", function () {
            if (pdfInput.files && pdfInput.files.length) {
                setStatus("PDF selected", "ready");
            } else {
                setStatus("Ready", "ready");
            }
        });

        latexEditor.addEventListener("input", function () {
            recompileBtn.disabled = !latexEditor.value.trim();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
