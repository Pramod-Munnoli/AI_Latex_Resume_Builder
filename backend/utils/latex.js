const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const { exec } = require("child_process");

async function writeLatexToTemp(tempDir, latex) {
  await fs.mkdir(tempDir, { recursive: true });
  const texPath = path.join(tempDir, "resume.tex");
  // DEBUG: Log first 500 chars of LaTeX to diagnose issues
  console.log("--- LaTeX Content (first 500 chars) ---");
  console.log(latex ? latex.substring(0, 500) : "[EMPTY LATEX]");
  console.log("--- End LaTeX Preview ---");
  await fs.writeFile(texPath, latex, "utf8");
  return texPath;
}

function compileLatex(tempDir) {
  return new Promise((resolve, reject) => {
    let exe = process.env.PDFLATEX_PATH || "pdflatex";
    exe = String(exe).trim().replace(/^\"+|\"+$/g, "");
    try {
      if (exe && (exe.endsWith("\\") || exe.endsWith("/"))) {
        const candidate = path.join(exe, "pdflatex.exe");
        if (fsSync.existsSync(candidate)) exe = candidate;
      } else if (fsSync.existsSync(exe) && fsSync.lstatSync(exe).isDirectory()) {
        const candidate = path.join(exe, "pdflatex.exe");
        if (fsSync.existsSync(candidate)) exe = candidate;
      } else if (!fsSync.existsSync(exe) && /bin[\\/]+windows$/i.test(exe)) {
        const candidate = path.join(exe, "pdflatex.exe");
        if (fsSync.existsSync(candidate)) exe = candidate;
      }
    } catch (_) { }

    const cmd = `"${exe}" -interaction=nonstopmode -halt-on-error resume.tex`;

    exec(cmd, { cwd: tempDir, maxBuffer: 10 * 1024 * 1024 }, async (error, stdout, stderr) => {
      let detailedLog = "";
      try {
        const logPath = path.join(tempDir, "resume.log");
        if (fsSync.existsSync(logPath)) {
          detailedLog = await fs.readFile(logPath, "utf8");
        }
      } catch (logErr) {
        console.warn("[Latex] Could not read resume.log:", logErr.message);
      }

      // If we have a detailed log file, use it. Otherwise fallback to stdout/stderr.
      const finalLog = detailedLog || `${stdout || ""}\n${stderr || ""}`.trim();

      if (error) {
        const errorMessage = finalLog || error.message || "Unknown compilation error";
        // Check if it's a "command not found" error
        if (errorMessage.includes("not found") || errorMessage.includes("is not recognized")) {
          reject(new Error("pdflatex is not installed or not in path. Please install TeX Live or MiKTeX."));
        } else {
          reject(new Error("LaTeX compilation failed: " + errorMessage));
        }
      } else {
        resolve({ stdout: finalLog, stderr });
      }
    });
  });
}

module.exports = { writeLatexToTemp, compileLatex };
