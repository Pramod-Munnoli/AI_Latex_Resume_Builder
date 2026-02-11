const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const { sanitizeLatex } = require("../utils/ai");
const { writeLatexToTemp, compileLatex } = require("../utils/latex");
const { uploadToStorage, deleteOldResumes } = require("../utils/storage"); // Updated import
const { getAuthenticatedUser } = require("../utils/auth");
const crypto = require("crypto");

const router = express.Router();
const tempDir = path.resolve(__dirname, "..", "temp");

router.post("/recompile", async (req, res) => {
  try {
    const { latex } = req.body || {};
    if (!latex || typeof latex !== "string") {
      return res.status(400).json({
        error: "No LaTeX content provided",
        code: "INVALID_LATEX",
        details: "Please enter valid LaTeX code before recompiling"
      });
    }

    if (latex.trim().length === 0) {
      return res.status(400).json({
        error: "LaTeX content is empty",
        code: "EMPTY_LATEX",
        details: "The LaTeX editor is empty. Please add some content before compiling."
      });
    }

    // Authenticate user to get ID for logs/tracking
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({
        error: "Authentication required",
        code: "AUTH_REQUIRED",
        details: "Please log in to recompile a resume."
      });
    }
    const userId = user.id;

    // --- BUCKET CONFIGURATION ---
    // User requested: "i dont need bucket for templates i only need the resume bucket = ai generated"
    const isAI = req.body.type === 'ai' || (req.body.title && req.body.title.includes('AI Generated'));
    const bucketName = 'resumes';

    // --- CACHE OPTIMIZATION (ONLY FOR AI RESUMES) ---
    const latexHash = crypto.createHash("md5").update(latex).digest("hex");
    const cacheFileName = `cache_${latexHash}.pdf`;
    const storagePath = `users/${userId}/${cacheFileName}`;

    if (isAI && userId !== 'guest') {
      try {
        const { data: existingFiles } = await require("../utils/storage").supabase.storage
          .from(bucketName)
          .list(`users/${userId}`, {
            search: cacheFileName
          });

        if (existingFiles && existingFiles.some(f => f.name === cacheFileName)) {
          console.log(`[Cache] Found identical AI resume for user ${userId}. Skipping compilation.`);
          const { data: { publicUrl } } = require("../utils/storage").supabase.storage
            .from(bucketName)
            .getPublicUrl(storagePath);

          return res.json({
            pdfUrl: publicUrl + `?cache=hit&v=${latexHash}`,
            log: "Loaded from cache (identical content detected).",
            cached: true
          });
        }
      } catch (cacheErr) {
        console.warn("[Cache] Check failed, proceeding with normal compilation:", cacheErr.message);
      }
    }
    // --- END CACHE OPTIMIZATION ---

    // Use single 'temp' directory for compilation
    const workDir = tempDir;

    console.log(`[Recompile] Updating latest resume in temp for user ${userId} (Type: ${isAI ? 'ai' : 'template'})`);

    const safeLatex = sanitizeLatex(latex);
    await writeLatexToTemp(workDir, safeLatex);

    console.log(`[Recompile] Compiling LaTeX...`);
    const { stdout, stderr } = await compileLatex(workDir);
    const log = `${stdout || ""}\n${stderr || ""}`.trim();

    const pdfPath = path.join(workDir, "resume.pdf");
    const cacheBuster = `?t=${Date.now()}&v=${latexHash}`;

    // ONLY upload to storage if it's an AI resume
    if (isAI && userId !== 'guest') {
      console.log(`[Recompile] Uploading AI resume to storage bucket: ${bucketName}`);

      // Clean up old AI resumes
      await deleteOldResumes(userId, bucketName);

      const publicUrl = await uploadToStorage(pdfPath, userId, bucketName, cacheFileName);
      return res.json({ pdfUrl: publicUrl + cacheBuster, log, cached: false });
    } else {
      // For templates, just serve from the local temp directory (/files/resume.pdf)
      console.log(`[Recompile] Template compiled. Serving locally (not saved to storage).`);
      return res.json({
        pdfUrl: `/files/resume.pdf` + cacheBuster,
        log,
        cached: false
      });
    }
  } catch (err) {
    console.error("Recompile error:", err);
    // ... error handling remains the same ...
    const errorOutput = err?.message || "";
    if (errorOutput.includes("!") || errorOutput.includes("Error")) {
      const lineMatch = errorOutput.match(/l\.(\d+)/);
      const lineNumber = lineMatch ? lineMatch[1] : null;
      let details = errorOutput;
      if (lineNumber) details = `LaTeX error on line ${lineNumber}. Check the compile log for details.`;
      return res.status(500).json({ error: "LaTeX compilation failed", code: "LATEX_COMPILATION_FAILED", details: details, log: errorOutput });
    }
    return res.status(500).json({ error: "Compilation failed", code: "COMPILATION_ERROR", details: err?.message || "Recompile failed", log: errorOutput });
  }
});

module.exports = router;