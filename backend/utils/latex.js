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

const axios = require("axios");

async function compileViaRemote(tempDir) {
  const texPath = path.join(tempDir, "resume.tex");
  const pdfPath = path.join(tempDir, "resume.pdf");
  const logPath = path.join(tempDir, "resume.log");

  const latex = await fs.readFile(texPath, "utf8");

  // 1. Try custom hosted compiler URL if configured (e.g. Render /api/compile)
  const remoteUrl = process.env.LATEX_COMPILER_URL;
  if (remoteUrl) {
    try {
      console.log(`[Latex] Attempting compilation via hosted compiler: ${remoteUrl}`);
      const resp = await axios.post(remoteUrl, { latex }, {
        responseType: "arraybuffer",
        timeout: 45000,
        headers: { "Content-Type": "application/json" }
      });

      if (resp.status === 200 && resp.data && resp.data.length > 0) {
        await fs.writeFile(pdfPath, Buffer.from(resp.data));
        await fs.writeFile(logPath, "Compiled successfully via hosted Render compiler.", "utf8");
        console.log(`[Latex] ✅ Successfully compiled via ${remoteUrl} (${resp.data.length} bytes)`);
        return { stdout: "Compiled successfully via hosted compiler", stderr: "" };
      }
    } catch (hostedErr) {
      console.warn(`[Latex] Hosted compiler (${remoteUrl}) failed: ${hostedErr.message}. Falling back to public online compiler...`);
    }
  }

  // 2. Fallback to reliable online compiler (latexonline.cc)
  try {
    console.log("[Latex] Compiling via online LaTeX service (latexonline.cc)...");
    const onlineUrl = `https://latexonline.cc/compile?text=${encodeURIComponent(latex)}`;
    const resp = await axios.get(onlineUrl, {
      responseType: "arraybuffer",
      timeout: 45000
    });

    if (resp.status === 200 && resp.data && resp.data.length > 0) {
      await fs.writeFile(pdfPath, Buffer.from(resp.data));
      await fs.writeFile(logPath, "Compiled successfully via online LaTeX compiler.", "utf8");
      console.log(`[Latex] ✅ Successfully compiled via online compiler (${resp.data.length} bytes)`);
      return { stdout: "Compiled successfully via online compiler", stderr: "" };
    }
    throw new Error(`Online compiler returned HTTP ${resp.status}`);
  } catch (onlineErr) {
    const errorMsg = onlineErr.response?.data?.toString() || onlineErr.message;
    await fs.writeFile(logPath, `Compilation failed: ${errorMsg}`, "utf8").catch(() => {});
    throw new Error(`Remote LaTeX compilation failed: ${errorMsg}`);
  }
}

function compileLatex(tempDir) {
  return new Promise(async (resolve, reject) => {
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

      const finalLog = detailedLog || `${stdout || ""}\n${stderr || ""}`.trim();

      if (error) {
        const errorMessage = finalLog || error.message || "Unknown compilation error";
        // If pdflatex is not installed locally on this machine, automatically compile via remote/hosted compiler
        if (
          errorMessage.includes("not found") ||
          errorMessage.includes("is not recognized") ||
          error.code === 127 ||
          error.code === "ENOENT"
        ) {
          console.log("[Latex] Local pdflatex not found on this machine. Automatically switching to remote compiler...");
          try {
            const remoteResult = await compileViaRemote(tempDir);
            return resolve(remoteResult);
          } catch (remoteError) {
            return reject(remoteError);
          }
        }

        reject(new Error("LaTeX compilation failed: " + errorMessage));
      } else {
        resolve({ stdout: finalLog, stderr });
      }
    });
  });
}

module.exports = { writeLatexToTemp, compileLatex, compileViaRemote };
