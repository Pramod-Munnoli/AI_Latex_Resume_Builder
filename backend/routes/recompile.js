const express = require("express");
const path = require("path");
const { sanitizeLatex } = require("../utils/ai");
const { writeLatexToTemp, compileLatex } = require("../utils/latex");

const router = express.Router();
const tempDir = path.resolve(__dirname, "..", "temp");

router.post("/recompile", async (req, res) => {
  try {
    const { latex } = req.body || {};
    if (!latex || typeof latex !== "string") {
      return res.status(400).json({ error: "Invalid LaTeX provided" });
    }
    const safeLatex = sanitizeLatex(latex);
    await writeLatexToTemp(tempDir, safeLatex);
    const { stdout, stderr } = await compileLatex(tempDir);
    const log = `${stdout || ""}\n${stderr || ""}`.trim();
    return res.json({ pdfUrl: "/files/resume.pdf", log });
  } catch (err) {
    const message = err?.message || "Recompile failed";
    return res.status(500).json({ error: message });
  }
});

module.exports = router;