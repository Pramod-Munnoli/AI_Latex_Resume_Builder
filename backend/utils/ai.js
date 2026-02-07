const axios = require("axios");
const fs = require("fs");
const path = require("path");
const GROQ_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2
].filter(Boolean);

async function callGroq(payload) {
  for (let i = 0; i < GROQ_KEYS.length; i++) {
    try {
      const resp = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        payload,
        {
          headers: {
            Authorization: `Bearer ${GROQ_KEYS[i]}`,
            "Content-Type": "application/json"
          }
        }
      );
      return resp;
    } catch (err) {
      const isRateLimit = err.response && (err.response.status === 429 || err.response.status === 413);
      if (isRateLimit && i < GROQ_KEYS.length - 1) {
        console.warn(`⚠️ Groq Key ${i + 1} rate limited, trying next key...`);
        continue;
      }
      throw err;
    }
  }
  throw new Error("All Groq API keys failed or are unavailable.");
}

/* ================= HELPERS (UNCHANGED) ================= */

function escapeLatex(str) {
  if (!str) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\$/g, "\\$")
    .replace(/\#/g, "\\#")
    .replace(/\%/g, "\\%")
    .replace(/\&/g, "\\&")
    .replace(/\_/g, "\\_")
    .replace(/\^/g, "\\^")
    .replace(/~/g, "\\textasciitilde{}");
}

function sanitizeLatex(latex) {
  if (!latex || typeof latex !== "string") return "";

  const blocked = [
    /\\write18\s*\{/gi,
    /\\openout\s*\d+/gi
  ];

  let safe = latex;
  blocked.forEach((re) => {
    safe = safe.replace(re, "% blocked");
  });

  // CRITICAL: Remove LaTeX comments that break when content is on one line
  // When AI outputs everything on a single line, % comments break the entire document
  // Match % followed by any non-backslash characters until we hit a backslash (next command)
  safe = safe.replace(/%[^%\\\\]*(?=\\\\)/g, ""); // Remove % comments followed by backslash
  // Also handle % comments that might appear before specific patterns
  safe = safe.replace(/%\s*[A-Za-z][^\\\\]*(?=\\\\)/g, "");

  // CRITICAL FIX: Replace quadruple backslashes with double backslashes
  // The AI sometimes outputs \\\\ as line breaks but LaTeX only needs \\
  // This causes "There's no line here to end" errors
  safe = safe.replace(/\\\\\\\\/g, "\\\\");

  // Fix common AI typos
  safe = safe.replace(/\\ule\{/g, "\\rule{"); // Fix \ule -> \rule
  safe = safe.replace(/\\rule\{linewidth\}/g, "\\rule{\\linewidth}"); // Fix missing backslash
  safe = safe.replace(/\\hrule\s*$/gm, "\\hrule"); // Ensure \hrule is valid

  // Auto-close itemize environments before new sections or end document
  const lines = safe.split('\n');
  let openItemizeCount = 0;
  const processedLines = [];

  for (let line of lines) {
    const trimmed = line.trim();

    // If we have open itemize and hit a section or end document, close them first
    if (openItemizeCount > 0 && (trimmed.startsWith('\\section') || trimmed.startsWith('\\end{document}'))) {
      while (openItemizeCount > 0) {
        processedLines.push('\\end{itemize}');
        openItemizeCount--;
      }
    }

    // Count begins and ends - regex to handle multiple on one line if they exist
    // Improved regex to handle optional spaces and better matching
    const beginMatches = trimmed.match(/\\begin\s*\{itemize\}/g) || [];
    const endMatches = trimmed.match(/\\end\s*\{itemize\}/g) || [];

    const begins = beginMatches.length;
    const ends = endMatches.length;

    // PROTECTION: If this line is JUST an \end{itemize} and we have no open itemize, skip it
    if (trimmed === '\\end{itemize}' && ends === 1 && begins === 0 && openItemizeCount === 0) {
      continue;
    }

    openItemizeCount += begins;
    openItemizeCount -= ends;
    if (openItemizeCount < 0) {
      // If we over-closed, reset count and we could potentially skip pushing this line 
      // but only if it's purely an end command. Already handled above for simple cases.
      openItemizeCount = 0;
    }

    processedLines.push(line);
  }
  safe = processedLines.join('\n');

  // Remove redefinitions of built-in LaTeX commands
  safe = safe.replace(/\\newcommand\{\\hrulefill\}.*$/gm, "% removed redefinition of \\hrulefill");
  safe = safe.replace(/\\renewcommand\{\\hrulefill\}.*$/gm, "% removed redefinition of \\hrulefill");

  // Remove trailing period from \end{document} if AI accidentally adds it
  safe = safe.replace(/\\end\{document\}\s*\./g, "\\end{document}");

  // Fix common AI typos in header links
  safe = safe.replace(/\\href\{https:\/\/linkedin\.com\/in\/username\}\{LinkedIn\}\s*\./g, "\\href{https://linkedin.com/in/username}{LinkedIn}");
  safe = safe.replace(/\\href\{https:\/\/github\.com\/username\}\{GitHub\}\s*\./g, "\\href{https://github.com/username}{GitHub}");
  safe = safe.replace(/\\href\{https:\/\/portfolio\.com\/username\}\{Portfolio\}\s*\./g, "\\href{https://portfolio.com/username}{Portfolio}");

  return safe;
}

function stripBadUnicode(str) {
  if (!str) return "";
  return String(str)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-");
}

function stripMarkdownFences(str) {
  if (!str) return "";
  let clean = String(str);

  // Remove opening code fences with any language tag (```latex, ```tex, ``` latex, etc.)
  clean = clean.replace(/^\s*```\s*(latex|tex)?\s*\n?/gim, "");

  // Remove closing code fences
  clean = clean.replace(/\n?\s*```\s*$/gim, "");

  // Also handle delimiters used in the prompt
  clean = clean.replace(/<<<\s*/g, "");
  clean = clean.replace(/\s*>>>/g, "");

  // Also handle inline triple backticks anywhere
  clean = clean.replace(/```(latex|tex)?/gi, "");
  clean = clean.replace(/```/g, "");

  return clean.trim();
}

function extractLatex(str) {
  if (!str) return "";
  const match = str.match(/\\documentclass[\s\S]*\\end\{document\}/);
  return match ? match[0] : str;
}

/* ================= FINAL GENERATOR ================= */

function basicTemplateFromText(text) {
  return `
\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}
\\begin{document}
${escapeLatex(text)}
\\end{document}
`.trim();
}

async function generateLatex(text, templateCode = null) {
  const groq = await generateViaGroq(text, templateCode);
  if (groq && /\\documentclass[\s\S]*\\end\{document\}/.test(groq)) {
    return sanitizeLatex(stripBadUnicode(extractLatex(stripMarkdownFences(groq))));
  }

  const gemini = await generateViaGemini(text, templateCode);
  if (gemini && /\\documentclass[\s\S]*\\end\{document\}/.test(gemini)) {
    return sanitizeLatex(stripBadUnicode(extractLatex(stripMarkdownFences(gemini))));
  }

  console.warn("⚠️ Using local fallback");
  return sanitizeLatex(basicTemplateFromText(text));
}

async function generateLatexWithSource(text, templateCode = null) {
  const groq = await generateViaGroq(text, templateCode);
  if (groq) {
    const cleaned = sanitizeLatex(stripBadUnicode(extractLatex(stripMarkdownFences(groq))));
    // Verify it's valid LaTeX before returning
    if (/\\documentclass[\s\S]*\\end\{document\}/.test(cleaned)) {
      return { latex: cleaned, source: "groq" };
    }
  }

  const gemini = await generateViaGemini(text, templateCode);
  if (gemini) {
    const cleaned = sanitizeLatex(stripBadUnicode(extractLatex(stripMarkdownFences(gemini))));
    if (/\\documentclass[\s\S]*\\end\{document\}/.test(cleaned)) {
      return { latex: cleaned, source: "gemini" };
    }
  }

  return { latex: sanitizeLatex(basicTemplateFromText(text)), source: "fallback" };
}

async function chatWithAI(userMessage) {
  if (GROQ_KEYS.length === 0) return "Chat service is currently unavailable.";

  try {
    const kbPath = path.join(__dirname, "..", "knowledge_base.md");
    const knowledgeBase = fs.readFileSync(kbPath, "utf8");

    const payload = {
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are the official AI Assistant for the "AI LaTeX Resume Builder" website. 
          Use the following Knowledge Base to answer user questions. 
          Be professional, helpful, and concise. 
          Use simple, clear, and user-understandable language. Avoid overly technical jargon when explaining features.
          If the answer is not in the Knowledge Base, politely say you don't know and suggest contact the developer Pramod Munnoli.
          
          KNOWLEDGE BASE:
          ${knowledgeBase}`
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      temperature: 0.5,
      max_tokens: 500
    };

    const resp = await callGroq(payload);
    return resp?.data?.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that.";
  } catch (err) {
    console.error("❌ Chat API failed:", err.message);
    return "I'm having trouble connecting right now. Please try again later.";
  }
}

const DEFAULT_ATS_TEMPLATE = `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{geometry}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\usepackage{titlesec}

\\geometry{left=0.6in, top=0.5in, right=0.6in, bottom=0.5in}
\\definecolor{linkblue}{RGB}{0,51,102}
\\hypersetup{colorlinks=true, linkcolor=linkblue, urlcolor=linkblue}

\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]
\\titlespacing{\\section}{0pt}{12pt}{8pt}

\\begin{document}
\\pagenumbering{gobble}

\\begin{center}
    {\\huge \\textbf{FULL NAME}} \\\\[0.5em]
    \\small City, State $|$ Phone $|$ Email $|$ \\href{LINKEDIN_URL}{LinkedIn} $|$ \\href{GITHUB_URL}{GitHub} $|$ \\href{PORTFOLIO_URL}{Portfolio}
\\end{center}

\\vspace{4pt}

\\section*{Professional Summary}
[Years of experience] [Primary Role] with expertise in [Key Skills]. 

\\section*{Skills}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Programming Languages}: Python, JavaScript, Java, C++, etc.
\\end{itemize}

\\section*{Experience}
\\textbf{Job Title} $|$ Company Name \\hfill Month Year -- Present
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Developed [feature] using [technology], resulting in [X% improvement].
\\end{itemize}

\\section*{Education}
\\textbf{Degree Name} $|$ Institution Name \\hfill Graduation Date

\\end{document}`;

module.exports = {
  generateLatex,
  generateLatexWithSource,
  sanitizeLatex,
  escapeLatex,
  chatWithAI
};


/* ================= GROQ ATS-OPTIMIZED GENERATOR ================= */
/* ================= GROQ ATS-OPTIMIZED GENERATOR ================= */
async function generateViaGroq(text, templateCode = null) {
  if (GROQ_KEYS.length === 0) return null;

  const baseTemplate = templateCode || DEFAULT_ATS_TEMPLATE;

  try {
    const payload = {
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: `
You are a professional LaTeX resume expert specializing in ATS (Applicant Tracking System) optimization. Your task is to create a resume that BOTH looks professional AND passes ATS screening algorithms.

GOAL: Generate a professional, ATS-OPTIMIZED resume. Scale the length based on user data: if data is minimal, MUST fill exactly one full page; if data is extensive, extend naturally to 1.5 or 2 pages.

═══════════════════════════════════════════════════════════════
                    ATS OPTIMIZATION RULES (CRITICAL)
═══════════════════════════════════════════════════════════════

1.  **KEYWORD INTEGRATION**: 
    - Naturally incorporate industry-standard keywords from the user's skills throughout the resume.
    - Mirror exact terminology from common job descriptions (e.g., "Python" not "Py", "JavaScript" not "JS").
    - Include both spelled-out terms AND acronyms.

2.  **STANDARD SECTION HEADINGS**:
    - Use "Professional Summary", "Skills", "Experience", "Education", "Projects".

3.  **QUANTIFIABLE ACHIEVEMENTS**:
    - EVERY bullet point MUST include measurable metrics (%, $, numbers).

4.  **SIMPLE ATS-PARSEABLE FORMAT**:
    - Linear top-to-bottom reading order.
    - No decorative graphics or complicated multi-column layouts.

═══════════════════════════════════════════════════════════════
                    LATEX RULES
═══════════════════════════════════════════════════════════════

13. **LATEX SYNTAX**: Every \\begin{itemize} MUST be closed with \\end{itemize}. 

14. **ESCAPE CHARACTERS**: Properly escape: &, %, $, #, _, {, }, ^, ~, \\.

15. **OUTPUT**: Return ONLY valid LaTeX code. No markdown fences, no explanations.

16. **PACKAGES**: Use ONLY packages defined in the provided template. Do NOT add new packages.

17. **STRICT TEMPLATE COMPLIANCE**: You MUST use the structure and visual style of the LaTeX template provided below. Replace the placeholder content with the user's information while keeping the commands, styling, and geometry exactly as they are in the template.

═══════════════════════════════════════════════════════════════

USER INFORMATION:
<<<
${text}
>>>

LATEX TEMPLATE (USE THIS EXACT STRUCTURE AND STYLE - DO NOT ADD ANY PERCENT SIGN COMMENTS):
<<<
${baseTemplate}
>>>
`
        }
      ],
      temperature: 0,
      max_tokens: 2000
    };

    const resp = await callGroq(payload);
    const latex = resp?.data?.choices?.[0]?.message?.content;
    if (!latex) return null;
    console.log("✅ Groq used");
    return latex.trim();
  } catch (err) {
    console.error("❌ Groq API failed:");
    console.error(JSON.stringify(err.response?.data || err.message, null, 2));
    return null;
  }
}

/* ================= GEMINI ATS-OPTIMIZED FALLBACK ================= */
async function generateViaGemini(text, templateCode = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const baseTemplate = templateCode || DEFAULT_ATS_TEMPLATE;

  try {
    const url =
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=" + apiKey;

    const resp = await axios.post(url, {
      contents: [{
        role: "user", parts: [{
          text: `
You are a professional LaTeX resume expert specializing in ATS (Applicant Tracking System) optimization. Your task is to create a resume that BOTH looks professional AND passes ATS screening algorithms.

GOAL: Generate a professional, ATS-OPTIMIZED resume. Scale the length based on user data: if data is minimal, MUST fill exactly one full page; if data is extensive, extend naturally to 1.5 or 2 pages.

═══════════════════════════════════════════════════════════════
                    STRICT TEMPLATE COMPLIANCE
═══════════════════════════════════════════════════════════════

You MUST use the structure and visual style of the LaTeX template provided below. Replace the placeholder content with the user's information while keeping the commands, styling, and geometry exactly as they are in the template.

═══════════════════════════════════════════════════════════════
                    LATEX RULES
═══════════════════════════════════════════════════════════════

1. **LATEX SYNTAX**: Every \\begin{itemize} MUST be closed with \\end{itemize}. 
2. **ESCAPE CHARACTERS**: Properly escape: &, %, $, #, _, {, }, ^, ~, \\.
3. **OUTPUT**: Return ONLY valid LaTeX code. No markdown fences, no explanations.
4. **NO COMMENTS**: Do NOT include any LaTeX comments (lines starting with %).

USER INFORMATION:
<<<
${text}
>>>

LATEX TEMPLATE:
<<<
${baseTemplate}
>>>
`
        }]
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2000
      }
    });

    const parts = resp?.data?.candidates?.[0]?.content?.parts;
    const latex = Array.isArray(parts)
      ? parts.map((p) => p.text || "").join("")
      : "";

    if (!latex) return null;

    console.log("✅ Gemini used");
    return latex.trim();
  } catch (err) {
    console.error("❌ Gemini API failed:");
    console.error(JSON.stringify(err.response?.data || err.message, null, 2));
    return null;
  }
}
