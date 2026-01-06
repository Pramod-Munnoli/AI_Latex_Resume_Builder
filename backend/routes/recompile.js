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

    const safeLatex = sanitizeLatex(latex);
    await writeLatexToTemp(tempDir, safeLatex);
    const { stdout, stderr } = await compileLatex(tempDir);
    const log = `${stdout || ""}\n${stderr || ""}`.trim();
    return res.json({ pdfUrl: "/files/resume.pdf", log });
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