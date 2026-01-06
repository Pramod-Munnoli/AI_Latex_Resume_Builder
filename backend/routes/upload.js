const express = require("express");
const multer = require("multer");
const path = require("path");
const { extractTextFromPdf } = require("../utils/pdf");
const ai = require("../utils/ai");
const { writeLatexToTemp, compileLatex } = require("../utils/latex");

const router = express.Router();
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

router.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        error: "No PDF file selected",
        code: "NO_FILE",
        details: "Please select a PDF file to upload"
      });
    }

    const text = await extractTextFromPdf(req.file.buffer);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "Could not extract text from PDF",
        code: "PDF_EXTRACTION_FAILED",
        details: "The PDF appears to be empty or contains only images. Please use a PDF with selectable text."
      });
    }

    const gen = ai.generateLatexWithSource
      ? ai.generateLatexWithSource
      : async (t) => ({ latex: await ai.generateLatex(t), source: "fallback" });
    const { latex, source } = await gen(text);
    await writeLatexToTemp(tempDir, latex);
    await compileLatex(tempDir);
    return res.json({ latex, pdfUrl: "/files/resume.pdf", source });
  } catch (err) {
    console.error("Upload error:", err);

    // Categorize errors
    if (err.message && err.message.includes("Only PDF files are allowed")) {
      return res.status(400).json({
        error: "Invalid file type",
        code: "INVALID_FILE_TYPE",
        details: "Only PDF files are supported. Please upload a PDF file."
      });
    }

    if (err.message && err.message.includes("File too large")) {
      return res.status(400).json({
        error: "File size exceeds limit",
        code: "FILE_TOO_LARGE",
        details: "Maximum file size is 20MB. Please upload a smaller PDF."
      });
    }

    if (err.message && (err.message.includes("API") || err.message.includes("rate limit"))) {
      return res.status(503).json({
        error: "AI service temporarily unavailable",
        code: "AI_SERVICE_ERROR",
        details: "The AI service is currently unavailable. Please try again in a few moments."
      });
    }

    if (err.message && err.message.includes("pdflatex")) {
      return res.status(500).json({
        error: "LaTeX compilation failed",
        code: "LATEX_COMPILATION_FAILED",
        details: err.message || "There was an error compiling the generated LaTeX. Please check the compile log for details."
      });
    }

    // Generic error
    const message = err?.message || "Upload processing failed";
    return res.status(500).json({
      error: "Processing failed",
      code: "PROCESSING_ERROR",
      details: message
    });
  }
});

module.exports = router;
