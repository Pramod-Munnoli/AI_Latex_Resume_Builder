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
      return res.status(400).json({ error: "No PDF provided" });
    }
    const text = await extractTextFromPdf(req.file.buffer);
    const gen = ai.generateLatexWithSource
      ? ai.generateLatexWithSource
      : async (t) => ({ latex: await ai.generateLatex(t), source: "fallback" });
    const { latex, source } = await gen(text);
    await writeLatexToTemp(tempDir, latex);
    await compileLatex(tempDir);
    return res.json({ latex, pdfUrl: "/files/resume.pdf", source });
  } catch (err) {
    const message = err?.message || "Upload processing failed";
    return res.status(500).json({ error: message });
  }
});

module.exports = router;
