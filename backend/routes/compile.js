const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const { writeLatexToTemp, compileLatex } = require("../utils/latex");

const router = express.Router();
const tempDir = path.resolve(__dirname, "..", "temp");

// Dedicated compile endpoint for remote / hosted compiler requests
router.post("/compile", async (req, res) => {
  let workDir = null;
  try {
    const { latex } = req.body || {};
    if (!latex || typeof latex !== "string" || latex.trim().length === 0) {
      return res.status(400).json({ error: "No LaTeX content provided" });
    }

    const uniqueId = `compile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    workDir = path.join(tempDir, uniqueId);

    await writeLatexToTemp(workDir, latex);
    const { stdout, stderr } = await compileLatex(workDir);

    const pdfPath = path.join(workDir, "resume.pdf");
    if (!fsSync.existsSync(pdfPath)) {
      return res.status(500).json({
        error: "Compilation failed to produce PDF",
        log: stdout || stderr
      });
    }

    const pdfBuffer = await fs.readFile(pdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"resume.pdf\"");
    res.send(pdfBuffer);
  } catch (err) {
    console.error("[Compile Endpoint Error]:", err.message);
    return res.status(500).json({
      error: "LaTeX compilation failed",
      details: err.message,
      log: err.message
    });
  } finally {
    if (workDir) {
      setTimeout(async () => {
        try {
          await fs.rm(workDir, { recursive: true, force: true });
        } catch (_) {}
      }, 30000); // Clean up after 30 seconds
    }
  }
});

module.exports = router;
