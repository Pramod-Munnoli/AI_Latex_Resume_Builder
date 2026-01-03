
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

    function setStatus(msg) { statusEl.textContent = msg; }

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

    async function uploadPdf() {
        const file = pdfInput.files && pdfInput.files[0];
        if (!file) {
            setStatus("Please select a PDF first");
            return;
        }

        const fd = new FormData();
        fd.append("pdf", file);

        setLoading(true);
        setStatus("Uploading and generating LaTeX...");
        compileLog.textContent = "";

        try {
            const resp = await fetch("/api/upload", { method: "POST", body: fd });
            const data = await resp.json();

            if (!resp.ok) {
                throw new Error(data && data.error ? data.error : "Upload failed");
            }

            latexEditor.value = (data.latex || "").trim();
            setPdfSrc(data.pdfUrl || "/files/resume.pdf");
            
            setStatus("Compile successfully");
            
            recompileBtn.disabled = !latexEditor.value.trim();
            downloadBtn.disabled = false;

            if (!compileLog.textContent) {
                compileLog.textContent = "Initial compile completed.";
            }
        } catch (err) {
            setStatus("Compile error");
            compileLog.textContent = (err && err.message) || "Upload processing failed";
        } finally {
            setLoading(false);
        }
    }

    async function recompileLatex() {
        const latex = latexEditor.value || "";
        if (!latex.trim()) {
            setStatus("Enter LaTeX before recompiling");
            return;
        }

        setLoading(true);
        setStatus("Compiling LaTeX...");

        try {
            const resp = await fetch("/api/recompile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ latex })
            });
            const data = await resp.json();

            if (!resp.ok) {
                throw new Error(data && data.error ? data.error : "Recompile failed");
            }

            setPdfSrc(data.pdfUrl || "/files/resume.pdf");
            compileLog.textContent = (data.log || "").trim();
            setStatus("Compile successfully");
            downloadBtn.disabled = false;
        } catch (err) {
            setStatus("Compile error");
            compileLog.textContent = (err && err.message) || "Recompile failed";
        } finally {
            setLoading(false);
        }
    }

    function downloadPdf() {
        window.open("/api/download", "_blank");
    }

    function init() {
        setStatus("Ready");
        recompileBtn.disabled = true;
        downloadBtn.disabled = true;

        uploadBtn.addEventListener("click", uploadPdf);
        recompileBtn.addEventListener("click", recompileLatex);
        downloadBtn.addEventListener("click", downloadPdf);

        pdfInput.addEventListener("change", function () {
            setStatus(pdfInput.files && pdfInput.files.length ? "PDF selected" : "Ready");
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
