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

    // Authenticate user to get ID for storage
    const user = await getAuthenticatedUser(req);
    const userId = user ? user.id : 'guest';

    // --- CACHE OPTIMIZATION ---
    // Generate a unique hash for this LaTeX content
    const latexHash = crypto.createHash("md5").update(latex).digest("hex");
    const resumeTitle = req.body.title || 'AI Generated Resume';
    const sanitizedTitle = resumeTitle.replace(/[^a-z0-9]/gi, '_');

    // We search for a file that matches this hash for this user
    const cacheFileName = `cache_${latexHash}.pdf`;
    const storagePath = `users/${userId}/${cacheFileName}`;

    if (userId !== 'guest') {
      try {
        const { data: existingFiles } = await require("../utils/storage").supabase.storage
          .from('resumes')
          .list(`users/${userId}`, {
            search: cacheFileName
          });

        if (existingFiles && existingFiles.some(f => f.name === cacheFileName)) {
          console.log(`[Cache] Found identical LaTeX content for user ${userId}. Skipping compilation.`);
          const { data: { publicUrl } } = require("../utils/storage").supabase.storage
            .from('resumes')
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

    // Use single 'temp' directory for both (as requested)
    const workDir = tempDir;

    console.log(`[Recompile] Updating latest resume in temp for user ${userId}`);

    const safeLatex = sanitizeLatex(latex);
    // Write to the temp dir (overwrites existing resume.tex)
    await writeLatexToTemp(workDir, safeLatex);

    console.log(`[Recompile] Compiling LaTeX...`);
    const { stdout, stderr } = await compileLatex(workDir);
    const log = `${stdout || ""}\n${stderr || ""}`.trim();

    // Clean up old resumes only if we are doing a fresh compile
    if (userId !== 'guest') {
      await deleteOldResumes(userId, 'resumes');
    }

    // Upload to Supabase Storage with the unique hash filename
    const pdfPath = path.join(workDir, "resume.pdf");

    const publicUrl = await uploadToStorage(pdfPath, userId, 'resumes', cacheFileName);

    // Append cache buster
    const cacheBuster = `?t=${Date.now()}&v=${latexHash}`;
    return res.json({ pdfUrl: publicUrl + cacheBuster, log, cached: false });
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