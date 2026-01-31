const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const { exec } = require("child_process");

async function writeLatexToTemp(tempDir, latex) {
  await fs.mkdir(tempDir, { recursive: true });
  const texPath = path.join(tempDir, "resume.tex");
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
    exec(cmd, { cwd: tempDir, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const log = (stderr || stdout || error.message || "");
        reject(new Error("LaTeX compilation failed: " + log));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

module.exports = { writeLatexToTemp, compileLatex };
