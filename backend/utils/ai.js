const axios = require("axios");
const fs = require("fs");
const path = require("path");

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

  // Fix common AI typos
  safe = safe.replace(/\\ule\{/g, "\\rule{"); // Fix \ule -> \rule
  safe = safe.replace(/\\rule\{linewidth\}/g, "\\rule{\\linewidth}"); // Fix missing backslash
  safe = safe.replace(/\\hrule\s*$/gm, "\\hrule"); // Ensure \hrule is valid

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
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-");
}

function stripMarkdownFences(str) {
  if (!str) return "";
  return String(str)
    .replace(/```latex/gi, "")
    .replace(/```/g, "")
    .trim();
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

async function generateLatex(text) {
  const groq = await generateViaGroq(text);
  if (groq && /\\documentclass[\s\S]*\\end\{document\}/.test(groq)) {
    return sanitizeLatex(stripBadUnicode(stripMarkdownFences(groq)));
  }

  const gemini = await generateViaGemini(text);
  if (gemini && /\\documentclass[\s\S]*\\end\{document\}/.test(gemini)) {
    return sanitizeLatex(stripBadUnicode(stripMarkdownFences(gemini)));
  }

  console.warn("⚠️ Using local fallback");
  return sanitizeLatex(basicTemplateFromText(text));
}

async function generateLatexWithSource(text) {
  const groq = await generateViaGroq(text);
  if (groq) return { latex: sanitizeLatex(groq), source: "groq" };

  const gemini = await generateViaGemini(text);
  if (gemini) return { latex: sanitizeLatex(gemini), source: "gemini" };

  return { latex: sanitizeLatex(basicTemplateFromText(text)), source: "fallback" };
}

async function chatWithAI(userMessage) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "Chat service is currently unavailable.";

  try {
    const kbPath = path.join(__dirname, "..", "knowledge_base.md");
    const knowledgeBase = fs.readFileSync(kbPath, "utf8");

    const url = "https://api.groq.com/openai/v1/chat/completions";
    const resp = await axios.post(
      url,
      {
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
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    return resp?.data?.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that.";
  } catch (err) {
    console.error("❌ Chat API failed:", err.message);
    return "I'm having trouble connecting right now. Please try again later.";
  }
}

module.exports = {
  generateLatex,
  generateLatexWithSource,
  sanitizeLatex,
  escapeLatex,
  chatWithAI
};


/* ================= groq FALLBACK (UNCHANGED) ================= */
async function generateViaGroq(text) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const resp = await axios.post(
      url,
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: `
You are a professional LaTeX resume expert. Your task is to extract user information and fill it into the high-quality LaTeX resume template provided below.

GOAL: Generate a professional, STUNNING ONE-PAGE resume that is FULL from top to bottom.

STRICT RULES:
1.  **PROJECT RULE**: You MUST include a maximum of 3 projects IF PROVIDED BY USER. Select only the 3 most refined ones major projects if provided. If NO projects are provided, you MUST create EXACTLY 2 relevant dummy projects based on user skills. UNDER NO CIRCUMSTANCES should you create more than 2 projects if none are provided. DO NOT EXCEED 2 DUMMY PROJECTS.
2.  **NO OMISSIONS (Other Sections)**: You MUST include ALL work experiences and ALL certifications. 
    - **EXPERIENCE RULE**: If NO work experience is provided, create a professional "Self-Driven Internship" section based on the user's skills and knowledge with EXACTLY 3 high-impact bullets. Never write "This section is omitted".
3.  **ONE-PAGE FULLNESS**: If the page is not full, you MUST:
    - Expand project descriptions with more detailed technical bullets (3-4 bullets each).
    - Add/Expand "Leadership \\& Volunteering" and "Honors \\& Awards".
    - Elaborate on "Relevant Coursework" to include 12-15 technical subjects.
4.  **Professional Summary**: Ensure the summary is exactly 3-4 lines of high-impact text.
5.  **LATEX SYNTAX**: Every \\begin{itemize} MUST be closed with an \\end{itemize} - THIS IS CRITICAL. Every environment must be closed before the final \\end{document}
6.  **ADDRESS SHORTENING**: Shorten address to EXACTLY 1 or 2 words (e.g., "City, State").
7.  **MISSING CONTACT INFO**: If links are missing, ALWAYS provide professional placeholders: "\\href{https://linkedin.com/in/username}{LinkedIn}", "\\href{https://github.com/username}{GitHub}", and "\\href{https://portfolio.com/username}{Portfolio}".

INSTRUCTIONS:
1.  **Identify Data**: Extract everything: name, contact, summary, skills, experience, projects, education, certifications, and extra info.
2.  **Escape Special Characters**: Escape &, %, $, #, _, {, }, ^, ~, \\.
3.  **Strict Layout**: Maintain the EXACT LaTeX structure below. Output ONLY valid LaTeX code.
4.  **Clean Output**: No markdown fences, no explanations.

USER INFORMATION:
<<<
${text}
>>>

LATEX TEMPLATE (SKELETON):
<<<
\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{geometry}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\usepackage{titlesec}

\\geometry{left=0.6in, top=0.5in, right=0.6in, bottom=0.5in}
\\definecolor{primaryblue}{RGB}{0,0,255}
\\hypersetup{colorlinks=true, linkcolor=primaryblue, urlcolor=primaryblue}

% Section formatting
\\titleformat{\\section}{\\large\\bfseries\\uppercase}{}{0em}{}[\\titlerule]
\\titlespacing{\\section}{0pt}{15pt}{10pt}

\\begin{document}
\\pagenumbering{gobble}

% Header
\\begin{center}
    {\\huge \\textbf{FULL NAME}} \\\\[0.3em]
    \\small SHORT_ADDRESS $|$ PHONE $|$ EMAIL $|$ \\href{LINKEDIN_URL}{LinkedIn} $|$ \\href{GITHUB_URL}{GitHub} $|$ \\href{PORTFOLIO_URL}{Portfolio}
\\end{center}

\\vspace{5pt}

% Summary
\\section*{Professional Summary}
SUMMARY_CONTENT (Ensure 3-4 high-impact lines)

% Technical Skills
\\section*{Technical Skills}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Programming Languages}: List all provided.
    \\item \\textbf{Tools \\& Technologies}: List all provided.
    \\item \\textbf{Core Competencies}: List 5-6 professional strengths.
\\end{itemize}

% Experience (Include ALL provided roles)
\\section*{Experience}
% For each role:
\\textbf{JOB_TITLE} $|$ COMPANY_NAME \\hfill DATES
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Bullet point describing responsibility or achievement.
\\end{itemize}

% Education
\\section*{Education}
\\textbf{DEGREE_NAME} $|$ INSTITUTION_NAME \\hfill DATES \\\\
\\textit{Relevant Coursework}: Detailed list of 12-15 technical subjects to fill space.

% Projects (Include MAX 3 if user provided, but EXACTLY 2 if dummy/generated)
\\section*{Projects}
% For each project:
\\textbf{PROJECT_NAME} $|$ \\textit{TECH_STACK} \\hfill \\href{PROJECT_LINK}{Link}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=3pt]
    \\item Detailed action-verb bullet point.
    \\item Detailed action-verb bullet point.
    \\item Detailed action-verb bullet point.
\\end{itemize}

% Extra Professional Sections (To ensure full page)
\\section*{Leadership \\& Volunteering}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=3pt]
    \\item High-impact contribution or leadership role (e.g. Open Source, Clubs).
\\end{itemize}

\\section*{Honors \\& Awards}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=3pt]
    \\item Award name from user data or inferred professional distinction.
\\end{itemize}

\\section*{Certifications \\& Languages}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Certifications}: List ALL provided certifications.
    \\item \\textbf{Languages}: English (Professional), Local Languages.
\\end{itemize}

\\end{document}
>>>
`
          }
        ],
        temperature: 0.2
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

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

/* ================= GEMINI FALLBACK (UNCHANGED) ================= */
async function generateViaGemini(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const url =
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=" + apiKey;

    const resp = await axios.post(url, {
      contents: [{
        role: "user", parts: [{
          text: `
You are a professional LaTeX resume expert. Your task is to extract user information and fill it into the high-quality LaTeX resume template provided below.

GOAL: Generate a professional, STUNNING ONE-PAGE resume that is FULL from top to bottom.

STRICT RULES:
1.  **PROJECT RULE**: You MUST include a maximum of 3 projects IF PROVIDED BY USER. Select only the 3 most refined ones major projects if provided. If NO projects are provided, you MUST create EXACTLY 2 relevant dummy projects based on user skills. UNDER NO CIRCUMSTANCES should you create more than 2 projects if none are provided. DO NOT EXCEED 2 DUMMY PROJECTS.
2.  **NO OMISSIONS (Other Sections)**: You MUST include ALL work experiences and ALL certifications. 
    - **EXPERIENCE RULE**: If NO work experience is provided, create a professional "Self-Driven Internship" section based on the user's skills and knowledge with EXACTLY 3 high-impact bullets. Never write "This section is omitted".
3.  **ONE-PAGE FULLNESS**: If the page is not full, you MUST:
    - Expand project descriptions with more detailed technical bullets (3-4 bullets each).
    - Add/Expand "Leadership \\& Volunteering" and "Honors \\& Awards".
    - Elaborate on "Relevant Coursework" to include 12-15 specific technical subjects.
4.  **Professional Summary**: Ensure the summary is exactly 3-4 lines of high-impact text.
5.  **LATEX SYNTAX**: Every \\begin{itemize} MUST be closed with an \\end{itemize} - THIS IS CRITICAL. Every environment must be closed before the final \\end{document}
6.  **ADDRESS SHORTENING**: Shorten address to EXACTLY 1 or 2 words (e.g., "City, State").
7.  **MISSING CONTACT INFO**: If links are missing, ALWAYS provide professional placeholders: "\\href{https://linkedin.com/in/username}{LinkedIn}", "\\href{https://github.com/username}{GitHub}", and "\\href{https://portfolio.com/username}{Portfolio}".

INSTRUCTIONS:
1.  **Identify Data**: Extract EVERYTHING provided: name, contact, summary, skills, experience, projects, education, certifications, and extra info.
2.  **Escape Special Characters**: Escape &, %, $, #, _, {, }, ^, ~, \\.
3.  **Strict Layout**: Maintain the EXACT LaTeX structure below. Output ONLY valid LaTeX code.
4.  **Clean Output**: No markdown fences, no explanations.
5.  **Package Rule**: Use ONLY packages defined in the template.

USER INFORMATION:
<<<
${text}
>>>

LATEX TEMPLATE (SKELETON):
<<<
\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{geometry}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\usepackage{titlesec}

\\geometry{left=0.6in, top=0.5in, right=0.6in, bottom=0.5in}
\\definecolor{primaryblue}{RGB}{0,0,255}
\\hypersetup{colorlinks=true, linkcolor=primaryblue, urlcolor=primaryblue}

% Section formatting
\\titleformat{\\section}{\\large\\bfseries\\uppercase}{}{0em}{}[\\titlerule]
\\titlespacing{\\section}{0pt}{15pt}{10pt}

\\begin{document}
\\pagenumbering{gobble}

% Header
\\begin{center}
    {\\huge \\textbf{FULL NAME}} \\\\[0.3em]
    \\small SHORT_ADDRESS $|$ PHONE $|$ EMAIL $|$ \\href{LINKEDIN_URL}{LinkedIn} $|$ \\href{GITHUB_URL}{GitHub} $|$ \\href{PORTFOLIO_URL}{Portfolio}
\\end{center}

\\vspace{5pt}

% Summary
\\section*{Professional Summary}
SUMMARY_CONTENT (Ensure 3-4 high-impact lines)

% Technical Skills
\\section*{Technical Skills}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Programming Languages}: List all provided.
    \\item \\textbf{Tools \\& Technologies}: List all provided.
    \\item \\textbf{Core Competencies}: List 5-6 professional strengths.
\\end{itemize}

% Experience (Include ALL provided roles)
\\section*{Experience}
% For each role:
\\textbf{JOB_TITLE} $|$ COMPANY_NAME \\hfill DATES
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Bullet point describing responsibility or achievement.
\\end{itemize}

% Education
\\section*{Education}
\\textbf{DEGREE_NAME} $|$ INSTITUTION_NAME \\hfill DATES \\\\
\\textit{Relevant Coursework}: Detailed list of 12-15 technical subjects to fill space.

% Projects (Include MAX 3 if user provided, but EXACTLY 2 if dummy/generated)
\\section*{Projects}
% For each project:
\\textbf{PROJECT_NAME} $|$ \\textit{TECH_STACK} \\hfill \\href{PROJECT_LINK}{Link}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=3pt]
    \\item Detailed action-verb bullet point.
    \\item Detailed action-verb bullet point.
    \\item Detailed action-verb bullet point.
\\end{itemize}

% Extra Professional Sections (To ensure full page)
\\section*{Leadership \\& Volunteering}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=3pt]
    \\item High-impact contribution or leadership role.
\\end{itemize}

\\section*{Honors \\& Awards}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=3pt]
    \\item Award name from user data or inferred professional distinction.
\\end{itemize}

\\section*{Certifications \\& Languages}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Certifications}: List ALL provided certifications.
    \\item \\textbf{Languages}: English (Professional), Local Languages.
\\end{itemize}

\\end{document}
>>>
`
        }]
      }]
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