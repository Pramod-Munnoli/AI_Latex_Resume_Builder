const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const { sanitizeLatex } = require("../utils/ai");
const { writeLatexToTemp, compileLatex } = require("../utils/latex");
const { uploadToStorage } = require("../utils/storage");
const { getAuthenticatedUser } = require("../utils/auth");

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

    console.log(`[Recompile] Updating latest resume in temp for user ${userId}`);

    const safeLatex = sanitizeLatex(latex);
    // Write to the root temp dir (overwrites existing resume.tex)
    await writeLatexToTemp(tempDir, safeLatex);

    console.log(`[Recompile] Compiling LaTeX...`);
    const { stdout, stderr } = await compileLatex(tempDir);
    const log = `${stdout || ""}\n${stderr || ""}`.trim();

    // Upload to Supabase Storage
    const pdfPath = path.join(tempDir, "resume.pdf");
    const resumeTitle = req.body.title || 'AI Generated Resume';
    const publicUrl = await uploadToStorage(pdfPath, userId, 'resumes', resumeTitle);

    // Append cache buster
    const cacheBuster = `?t=${Date.now()}`;
    return res.json({ pdfUrl: publicUrl + cacheBuster, log });
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