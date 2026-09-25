const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const { extractTextFromPdf } = require("../utils/pdf");
const { generateLatexWithJD, generateJDMatchedResume } = require("../utils/ai");
const { writeLatexToTemp, compileLatex } = require("../utils/latex");
const { uploadToStorage, deleteOldResumes, supabase } = require("../utils/storage");
const { getAuthenticatedUser } = require("../utils/auth");
const crypto = require("crypto");

const router = express.Router();

// Accept up to 2 PDF files: "pdf" (LinkedIn/primary) and "oldResume" (existing resume)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  },
});

const tempDir = path.resolve(__dirname, "..", "temp");

/**
 * POST /api/jd-match
 * Body (multipart/form-data):
 *   - mode: "linkedin_jd" | "old_resume_jd"
 *   - jd: job description text (required)
 *   - pdf: LinkedIn PDF file (required for "linkedin_jd" mode)
 *   - oldResume: existing resume PDF (required for "old_resume_jd" mode)
 *   - title: resume title (optional)
 */
router.post("/jd-match", upload.fields([
  { name: "pdf", maxCount: 1 },
  { name: "oldResume", maxCount: 1 }
]), async (req, res) => {
  try {
    const mode = req.body.mode || "linkedin_jd";
    const jobDescription = (req.body.jd || "").trim();

    if (!jobDescription) {
      return res.status(400).json({
        error: "Job description is required",
        code: "NO_JD",
        details: "Please paste the job description to generate a JD-matched resume."
      });
    }

    // ── Mode: LinkedIn PDF + JD ──
    if (mode === "linkedin_jd") {
      const pdfFile = req.files?.pdf?.[0] || req.files?.oldResume?.[0];
      if (!pdfFile || !pdfFile.buffer) {
        return res.status(400).json({
          error: "LinkedIn PDF is required for this mode",
          code: "NO_PDF",
          details: "Please upload your LinkedIn profile PDF."
        });
      }

      const profileText = await extractTextFromPdf(pdfFile.buffer);
      if (!profileText || profileText.trim().length === 0) {
        return res.status(400).json({
          error: "Could not extract text from PDF",
          code: "PDF_EXTRACTION_FAILED",
          details: "The PDF appears to be empty or image-only. Please use a PDF with selectable text."
        });
      }

      const user = await getAuthenticatedUser(req);
      if (!user) {
        return res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED", details: "Please log in." });
      }

      const resumeTitle = req.body.title || "JD-Matched Resume";
      const { latex, source } = await generateLatexWithJD(profileText, jobDescription);
      return await compileAndRespond(res, latex, source, user.id, resumeTitle);
    }

    // ── Mode: Old Resume PDF + JD ──
    if (mode === "old_resume_jd") {
      const oldResumeFile = req.files?.oldResume?.[0] || req.files?.pdf?.[0];
      if (!oldResumeFile || !oldResumeFile.buffer) {
        return res.status(400).json({
          error: "Your existing resume PDF is required for this mode",
          code: "NO_OLD_RESUME",
          details: "Please upload your existing resume PDF."
        });
      }

      const oldResumeText = await extractTextFromPdf(oldResumeFile.buffer);
      if (!oldResumeText || oldResumeText.trim().length === 0) {
        return res.status(400).json({
          error: "Could not extract text from resume PDF",
          code: "PDF_EXTRACTION_FAILED",
          details: "The resume PDF appears to be empty or image-only."
        });
      }

      const user = await getAuthenticatedUser(req);
      if (!user) {
        return res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED", details: "Please log in." });
      }

      const resumeTitle = req.body.title || "JD-Optimized Resume";
      const { latex, source } = await generateJDMatchedResume(oldResumeText, jobDescription);
      return await compileAndRespond(res, latex, source, user.id, resumeTitle);
    }

    return res.status(400).json({ error: "Invalid mode", code: "INVALID_MODE", details: "mode must be 'linkedin_jd' or 'old_resume_jd'." });

  } catch (err) {
    console.error("JD-Match error:", err);

    if (err.message && err.message.includes("LaTeX compilation failed")) {
      let generatedLatex = null;
      try {
        const texPath = path.join(tempDir, "resume.tex");
        generatedLatex = await fs.readFile(texPath, "utf8");
      } catch (_) {}
      return res.status(500).json({
        error: "LaTeX compilation failed",
        code: "LATEX_COMPILATION_FAILED",
        details: "AI generated LaTeX but compilation failed. Check the code for errors.",
        log: err.message,
        latex: generatedLatex,
        compilationFailed: true
      });
    }

    return res.status(500).json({
      error: "Processing failed",
      code: "PROCESSING_ERROR",
      details: err?.message || "JD-match processing failed"
    });
  }
});

/**
 * Shared helper: compile LaTeX, upload PDF, return JSON response.
 */
async function compileAndRespond(res, latex, source, userId, resumeTitle) {
  const latexHash = crypto.createHash("md5").update(latex).digest("hex");
  const cacheFileName = `jd_${latexHash}.pdf`;
  const storagePath = `users/${userId}/${cacheFileName}`;

  // Check cache
  if (userId !== "guest") {
    try {
      const { data: existingFiles } = await supabase.storage
        .from("resumes")
        .list(`users/${userId}`, { search: cacheFileName });

      if (existingFiles && existingFiles.some(f => f.name === cacheFileName)) {
        console.log(`[JD Cache] Hit for user ${userId}`);
        const { data: { publicUrl } } = supabase.storage
          .from("resumes")
          .getPublicUrl(storagePath);
        return res.json({ latex, pdfUrl: publicUrl + `?cache=hit&v=${latexHash}`, source, cached: true });
      }
    } catch (cacheErr) {
      console.warn("[JD Cache] Check failed:", cacheErr.message);
    }
  }

  // Compile
  await writeLatexToTemp(tempDir, latex);
  console.log(`[JD-Match] Compiling for user ${userId}...`);
  await compileLatex(tempDir);

  const pdfPath = path.join(tempDir, "resume.pdf");
  if (userId !== "guest") {
    await deleteOldResumes(userId, "resumes");
  }

  const publicUrl = await uploadToStorage(pdfPath, userId, "resumes", cacheFileName);
  const cacheBuster = `?t=${Date.now()}&v=${latexHash}`;
  return res.json({ latex, pdfUrl: publicUrl + cacheBuster, source, cached: false });
}

module.exports = router;
