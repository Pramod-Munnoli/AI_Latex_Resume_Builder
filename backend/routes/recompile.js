const express = require("express");
const path = require("path");
const { sanitizeLatex } = require("../utils/ai");
const { writeLatexToTemp, compileLatex } = require("../utils/latex");
const { uploadToStorage } = require("../utils/storage");
const { getAuthenticatedUser } = require("../utils/auth");

const router = express.Router();
const tempDir = path.resolve(__dirname, "..", "temp");

router.post("/recompile", async (req, res) => {
  const requestId = Date.now() + "_" + Math.floor(Math.random() * 1000);
  const requestTempDir = path.join(tempDir, requestId);

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

    console.log(`[Recompile] Starting request ${requestId} for user ${userId}`);

    const safeLatex = sanitizeLatex(latex);
    console.log(`[Recompile] Writing LaTeX to ${requestTempDir}...`);
    await writeLatexToTemp(requestTempDir, safeLatex);

    console.log(`[Recompile] Compiling LaTeX...`);
    const { stdout, stderr } = await compileLatex(requestTempDir);
    const log = `${stdout || ""}\n${stderr || ""}`.trim();
    console.log(`[Recompile] Compilation finished. Log length: ${log.length}`);

    // Upload to Supabase Storage (S3-compatible) in user folder with descriptive name
    const pdfPath = path.join(requestTempDir, "resume.pdf");
    const resumeTitle = req.body.title || 'AI Generated Resume';
    console.log(`[Recompile] Uploading PDF to storage as ${resumeTitle}...`);
    const publicUrl = await uploadToStorage(pdfPath, userId, 'resumes', resumeTitle);
    console.log(`[Recompile] Upload successful: ${publicUrl}`);

    // Append cache buster
    const cacheBuster = `?t=${Date.now()}`;
    return res.json({ pdfUrl: publicUrl + cacheBuster, log });
  } catch (err) {
    console.error("Recompile error:", err);

    const errorOutput = err?.message || "";

    // Parse LaTeX compilation errors
    if (errorOutput.includes("!") || errorOutput.includes("Error")) {
      // Extract line number if available
      const lineMatch = errorOutput.match(/l\.(\d+)/);
      const lineNumber = lineMatch ? lineMatch[1] : null;

      let details = errorOutput;
      if (lineNumber) {
        details = `LaTeX error on line ${lineNumber}. Check the compile log for details.`;
      }

      return res.status(500).json({
        error: "LaTeX compilation failed",
        code: "LATEX_COMPILATION_FAILED",
        details: details,
        log: errorOutput
      });
    }

    // Generic error
    const message = err?.message || "Recompile failed";
    return res.status(500).json({
      error: "Compilation failed",
      code: "COMPILATION_ERROR",
      details: message,
      log: errorOutput
    });
  }
});

module.exports = router;