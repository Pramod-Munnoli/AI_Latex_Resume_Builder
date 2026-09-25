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

  // 2. Try latexonline.cc
  try {
    console.log("[Latex] Compiling via latexonline.cc...");
    const onlineUrl = `https://latexonline.cc/compile?text=${encodeURIComponent(latex)}`;
    const resp = await axios.get(onlineUrl, {
      responseType: "arraybuffer",
      timeout: 45000
    });

    const buf = Buffer.from(resp.data || "");
    const isPDF = buf.length > 100 && buf.slice(0, 4).toString() === "%PDF";
    if (resp.status === 200 && isPDF) {
      await fs.writeFile(pdfPath, buf);
      await fs.writeFile(logPath, "Compiled successfully via latexonline.cc.", "utf8");
      console.log(`[Latex] ✅ Successfully compiled via latexonline.cc (${buf.length} bytes)`);
      return { stdout: "Compiled successfully via latexonline.cc", stderr: "" };
    }
    console.warn(`[Latex] latexonline.cc returned non-PDF response (${buf.length} bytes), trying fallback...`);
  } catch (onlineErr) {
    console.warn(`[Latex] latexonline.cc failed: ${onlineErr.message}. Trying fallback compiler...`);
  }

  // 3. Fallback: YtoTex / latex.codecogs.com
  try {
    console.log("[Latex] Compiling via LaTeX.js online service...");
    const resp2 = await axios.post(
      "https://texlive.net/cgi-bin/latexcgi",
      new URLSearchParams({
        filecontents0: latex,
        filename0: "resume.tex",
        engine: "pdflatex",
        return: "pdf"
      }).toString(),
      {
        responseType: "arraybuffer",
        timeout: 60000,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }
    );
    const buf2 = Buffer.from(resp2.data || "");
    const isPDF2 = buf2.length > 100 && buf2.slice(0, 4).toString() === "%PDF";
    if (resp2.status === 200 && isPDF2) {
      await fs.writeFile(pdfPath, buf2);
      await fs.writeFile(logPath, "Compiled successfully via texlive.net.", "utf8");
      console.log(`[Latex] ✅ Successfully compiled via texlive.net (${buf2.length} bytes)`);
      return { stdout: "Compiled successfully via texlive.net", stderr: "" };
    }
    const errText2 = buf2.toString("utf8").substring(0, 500);
    throw new Error(`texlive.net returned non-PDF: ${errText2}`);
  } catch (fallbackErr) {
    const errorMsg = fallbackErr.message;
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

    // Delete any stale log file from a previous remote run to avoid reading wrong error messages
    const logPath = path.join(tempDir, "resume.log");
    try { await fs.unlink(logPath); } catch (_) { /* ok if it doesn't exist */ }

    const cmd = `"${exe}" -interaction=nonstopmode -halt-on-error resume.tex`;

    exec(cmd, { cwd: tempDir, maxBuffer: 10 * 1024 * 1024 }, async (error, stdout, stderr) => {
      if (error) {
        // pdflatex failed for ANY reason — fall through to remote compiler
        // (covers: not installed, ENOENT, compilation errors, stale log confusion, etc.)
        console.log(`[Latex] Local pdflatex failed (code=${error.code}): ${error.message?.substring(0, 100)}. Switching to remote compiler...`);
        try {
          const remoteResult = await compileViaRemote(tempDir);
          return resolve(remoteResult);
        } catch (remoteError) {
          return reject(remoteError);
        }
      }

      // pdflatex succeeded locally
      let detailedLog = "";
      try {
        if (fsSync.existsSync(logPath)) {
          detailedLog = await fs.readFile(logPath, "utf8");
        }
      } catch (logErr) {
        console.warn("[Latex] Could not read resume.log:", logErr.message);
      }
      resolve({ stdout: detailedLog || `${stdout || ""}\n${stderr || ""}`.trim(), stderr });
    });
  });
}

module.exports = { writeLatexToTemp, compileLatex, compileViaRemote };
