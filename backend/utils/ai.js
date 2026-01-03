const axios = require("axios");

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
  if (groq && /\\documentclass[\\s\\S]*\\end\\{document\\}/.test(groq)) {
    return sanitizeLatex(stripBadUnicode(stripMarkdownFences(groq)));
  }

  const gemini = await generateViaGemini(text);
  if (gemini && /\\documentclass[\\s\\S]*\\end\\{document\\}/.test(gemini)) {
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

module.exports = {
  generateLatex,
  generateLatexWithSource,
  sanitizeLatex,
  escapeLatex
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
            content: `You are generating a highly professional, ATS-optimized LaTeX resume to be compiled using pdflatex (TeX Live).

            STRICT OUTPUT RULES (NON-NEGOTIABLE):
            - Output ONLY valid LaTeX source code
            - Do NOT include explanations, comments, markdown, or plain text
            - The output MUST start with \documentclass and end with \end{document}
            - Any violation makes the output INVALID
            
            COMPILATION RULES:
            - pdflatex ONLY (TeX Live)
            - Do NOT use XeLaTeX or LuaLaTeX
            - Do NOT use \input, \include, shell-escape, \write18, or system commands
            
            PACKAGE RULES:
            - Use \documentclass[11pt,a4paper]{article}
            - Allowed packages ONLY: geometry, enumitem, hyperref, titlesec, fancyhdr, xcolor
            - Do NOT use tables, multicolumn layouts, icons, images, TikZ, graphics, or custom .sty files
            
            ENCODING RULES:
            - ASCII characters ONLY
            - Replace smart quotes with normal quotes
            - Avoid special Unicode symbols
            - Ensure pdflatex compiles with ZERO errors
            
            LAYOUT & DESIGN RULES (ATS-FIRST):
            - Clean, minimal, ATS-friendly resume
            - STRICT ONE-PAGE LIMIT
            - Reduce margins and vertical spacing as needed
            - Avoid excessive whitespace
            
            HEADER RULES (VERY IMPORTANT):
            - Center the candidate FULL NAME at the top
            - Name must be large and bold
            - Directly below, ONE centered row containing:
              Mobile number | Email address | LinkedIn | GitHub | Portfolio
            - Display links ONLY as labels (e.g., LinkedIn, GitHub)
            - Header MUST fit on ONE line
            - DO NOT place any horizontal rule under the header
            
            SECTION FORMATTING RULES:
            - Each section title must be followed IMMEDIATELY by a horizontal rule
            - Section content MUST appear BELOW the horizontal rule
            - DO NOT place horizontal rules at the END of sections
            - Bullets must align vertically UNDER the section (no bullets outside or beside titles)
            
            BULLET POINT RULES:
            - Use itemize environment ONLY
            - Do NOT use dashes for listing content
            - Each bullet must be concise
            - Bullet text MUST NOT exceed two lines
            - Avoid paragraph-style bullets
            
            SKILLS SECTION RULES (CRITICAL):
            - MERGE Technical Skills and Professional Skills into ONE section titled "Skills"
            - Group related skills logically under clear subcategories
              Examples:
              - Programming Languages: Java, Python, JavaScript
              - Frameworks and Libraries: React, Node.js, Express
              - Tools and Technologies: Git, Docker, Linux
            - DO NOT list individual skills as separate bullets
            - Each bullet should represent ONE related skill group
            - Use two-column layout ONLY if content is compact and readable
            
            TWO-COLUMN RULES (LIMITED USE):
            - Allowed ONLY for: Skills, Certifications, Additional Information
            - Do NOT use two columns for Summary, Experience, or Projects
            
            SECTION ORDER:
            1. Summary
            2. Skills
            3. Experience OR Projects
            4. Projects (if both exist)
            5. Education
            6. Certifications (optional)
            7. Additional Information (optional)
            
            SUMMARY RULES:
            - Exactly 2–3 concise lines
            - Role + core skills + career focus
            - No fluff or storytelling
            
            PROJECT RULES:
            - Project title on its own line
            - EXACTLY 2–3 bullet points per project
            - Each bullet must include:
              action verb + technology used + purpose or outcome
            - Bullets must be short and scannable
            
            EXPERIENCE RULES:
            - Use concise, impact-focused bullets
            - Mention tools and technologies already provided
            - Avoid repetition and filler phrases
            
            CONTENT INTEGRITY RULES:
            - Preserve ALL factual information exactly as provided
            - Do NOT change names, dates, locations, or links
            - Do NOT invent education, experience, certifications, or metrics
            - If content is insufficient, improve Skills or Projects only
            
            FINAL OUTPUT RULE:
            - Output ONLY valid LaTeX code
            - Must compile successfully with pdflatex
            - No text outside LaTeX
            
            INPUT TEXT:
            <<<
            ${text}
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
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=" +
      apiKey;

    const resp = await axios.post(url, {
      contents: [{
        role: "user", parts: [{
          text: ` 
          You are generating a highly professional, ATS-optimized LaTeX resume to be compiled using pdflatex (TeX Live).

          STRICT OUTPUT RULES (NON-NEGOTIABLE):
          - Output ONLY valid LaTeX source code
          - Do NOT include explanations, comments, markdown, or plain text
          - The output MUST start with \documentclass and end with \end{document}
          - Any violation makes the output INVALID
          
          COMPILATION RULES:
          - pdflatex ONLY (TeX Live)
          - Do NOT use XeLaTeX or LuaLaTeX
          - Do NOT use \input, \include, shell-escape, \write18, or system commands
          
          PACKAGE RULES:
          - Use \documentclass[11pt,a4paper]{article}
          - Allowed packages ONLY: geometry, enumitem, hyperref, titlesec, fancyhdr, xcolor
          - Do NOT use tables, multicolumn layouts, icons, images, TikZ, graphics, or custom .sty files
          
          ENCODING RULES:
          - ASCII characters ONLY
          - Replace smart quotes with normal quotes
          - Avoid special Unicode symbols
          - Ensure pdflatex compiles with ZERO errors
          
          LAYOUT & DESIGN RULES (ATS-FIRST):
          - Clean, minimal, ATS-friendly resume
          - STRICT ONE-PAGE LIMIT
          - Reduce margins and vertical spacing as needed
          - Avoid excessive whitespace
          
          HEADER RULES (VERY IMPORTANT):
          - Center the candidate FULL NAME at the top
          - Name must be large and bold
          - Directly below, ONE centered row containing:
            Mobile number | Email address | LinkedIn | GitHub | Portfolio
          - Display links ONLY as labels (e.g., LinkedIn, GitHub)
          - Header MUST fit on ONE line
          - DO NOT place any horizontal rule under the header
          
          SECTION FORMATTING RULES:
          - Each section title must be followed IMMEDIATELY by a horizontal rule
          - Section content MUST appear BELOW the horizontal rule
          - DO NOT place horizontal rules at the END of sections
          - Bullets must align vertically UNDER the section (no bullets outside or beside titles)
          
          BULLET POINT RULES:
          - Use itemize environment ONLY
          - Do NOT use dashes for listing content
          - Each bullet must be concise
          - Bullet text MUST NOT exceed two lines
          - Avoid paragraph-style bullets
          
          SKILLS SECTION RULES (CRITICAL):
          - MERGE Technical Skills and Professional Skills into ONE section titled "Skills"
          - Group related skills logically under clear subcategories
            Examples:
            - Programming Languages: Java, Python, JavaScript
            - Frameworks and Libraries: React, Node.js, Express
            - Tools and Technologies: Git, Docker, Linux
          - DO NOT list individual skills as separate bullets
          - Each bullet should represent ONE related skill group
          - Use two-column layout ONLY if content is compact and readable
          
          TWO-COLUMN RULES (LIMITED USE):
          - Allowed ONLY for: Skills, Certifications, Additional Information
          - Do NOT use two columns for Summary, Experience, or Projects
          
          SECTION ORDER:
          1. Summary
          2. Skills
          3. Experience OR Projects
          4. Projects (if both exist)
          5. Education
          6. Certifications (optional)
          7. Additional Information (optional)
          
          SUMMARY RULES:
          - Exactly 2–3 concise lines
          - Role + core skills + career focus
          - No fluff or storytelling
          
          PROJECT RULES:
          - Project title on its own line
          - EXACTLY 2–3 bullet points per project
          - Each bullet must include:
            action verb + technology used + purpose or outcome
          - Bullets must be short and scannable
          
          EXPERIENCE RULES:
          - Use concise, impact-focused bullets
          - Mention tools and technologies already provided
          - Avoid repetition and filler phrases
          
          CONTENT INTEGRITY RULES:
          - Preserve ALL factual information exactly as provided
          - Do NOT change names, dates, locations, or links
          - Do NOT invent education, experience, certifications, or metrics
          - If content is insufficient, improve Skills or Projects only
          
          FINAL OUTPUT RULE:
          - Output ONLY valid LaTeX code
          - Must compile successfully with pdflatex
          - No text outside LaTeX
          
          INPUT TEXT:
          <<<
          ${text}
          >>>
          
` }]
      }],
      generationConfig: { temperature: 0.2 }
    });

    const parts = resp?.data?.candidates?.[0]?.content?.parts;
    const latex = Array.isArray(parts)
      ? parts.map((p) => p.text || "").join("")
      : "";

    if (!latex) return null;

    console.log("✅ Gemini used");
    return latex.trim();
  } catch {
    return null;
  }
}















/* ================= AGENTROUTER – CLAUDE ================= */
// async function generateViaClaude(text) {
//   const apiKey = process.env.AGENTROUTER_API_KEY;
//   if (!apiKey) {
//     console.warn("⚠️ AGENTROUTER_API_KEY not set");
//     return null;
//   }

//   const prompt = `
// You are generating a professional LaTeX resume to be compiled using pdflatex (TeX Live).

// STRICT RULES (VERY IMPORTANT):
// - Return ONLY valid LaTeX source code
// - Do NOT wrap the output in markdown, code fences, or explanations
// - The output MUST start with \\documentclass and end with \\end{document}

// COMPILATION RULES:
// - pdflatex ONLY (TeX Live)
// - Do NOT use XeLaTeX or LuaLaTeX
// - Do NOT use \\input, \\include, or external files
// - Do NOT use shell-escape, \\write18, or system commands

// PACKAGE RULES:
// - Use \\documentclass[11pt,a4paper]{article}
// - Use ONLY these packages if needed:
//   geometry, enumitem, hyperref, titlesec, fancyhdr, xcolor
// - Do NOT use tables, multicolumn layouts, icons, images, TikZ, or custom .sty files

// ENCODING RULES:
// - Use ASCII characters only
// - Replace smart quotes with normal quotes
// - Replace Unicode bullets with hyphens
// - Avoid special Unicode symbols

// LAYOUT RULES:
// - Clean, ATS-friendly resume layout
// - 1 page preferred, maximum 2 pages

// CONTENT RULES:
// - Preserve all factual information exactly as provided
// - Do NOT hallucinate education, experience, skills, or dates

// OUTPUT RULES:
// - Output ONLY valid LaTeX code

// INPUT TEXT:
// <<<
// ${text}
// >>>
// `;

//   try {
//     const res = await axios.post(
//       "https://agentrouter.org/v1/chat/completions",
//       {
//         model: "anthropic/claude-3.5-sonnet",
//         messages: [
//           {
//             role: "user",
//             content: prompt
//           }
//         ],
//         temperature: 0.2,
//         max_tokens: 4096
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${apiKey}`,
//           "Content-Type": "application/json"
//         }
//       }
//     );

//     const latex = res?.data?.choices?.[0]?.message?.content;
//     if (!latex) return null;

//     // 🔒 VERY IMPORTANT: validation (DO NOT REMOVE)
//     if (
//       !latex.trim().startsWith("\\documentclass") ||
//       !latex.includes("\\begin{document}") ||
//       !latex.includes("\\end{document}")
//     ) {
//       console.error("❌ Claude returned NON-LaTeX");
//       console.error(latex.slice(0, 200));
//       return null;
//     }

//     console.log("✅ Claude (AgentRouter) used");
//     return latex.trim();
//   } catch (err) {
//     console.error("❌ Claude AgentRouter failed:", err.response?.data || err.message);
//     return null;
//   }
// }
