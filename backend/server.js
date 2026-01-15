
const express = require("express");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const uploadRouter = require("./routes/upload");
const recompileRouter = require("./routes/recompile");
const templatesRouter = require("./routes/templates");
const userResumesRouter = require("./routes/user-resumes");

const frontendDir = path.join(__dirname, "..", "frontend");
const tempDir = path.join(__dirname, "temp");

app.use("/api", uploadRouter);
app.use("/api", recompileRouter);
app.use("/api", templatesRouter);
app.use("/api", userResumesRouter);

// Serve public config for frontend
app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

// Serve compiled files (PDF) with no-cache for fresh reloads
app.use("/files", express.static(tempDir, {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache");
  },
}));

// Serve the frontend
app.use(express.static(frontendDir));

// PDF preview endpoint (optional; static serving also works)
app.get("/api/pdf", (req, res) => {
  const pdfPath = path.join(tempDir, "resume.pdf");
  res.sendFile(pdfPath, (err) => {
    if (err) return res.status(500).json({ error: "PDF not available" });
  });
});

// Download endpoint
app.get("/api/download", (req, res) => {
  const pdfPath = path.join(tempDir, "resume.pdf");
  res.setHeader("Content-Disposition", "attachment; filename=\"resume.pdf\"");
  res.sendFile(pdfPath, (err) => {
    if (err) return res.status(500).json({ error: "PDF not available" });
  });
});

// Health check
app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI LaTeX Resume Builder server running at http://localhost:${PORT}/`);
});
