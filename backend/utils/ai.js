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

  // Fix common AI typos
  safe = safe.replace(/\\ule\{/g, "\\rule{"); // Fix \ule -> \rule
  safe = safe.replace(/\\rule\{linewidth\}/g, "\\rule{\\linewidth}"); // Fix missing backslash
  safe = safe.replace(/\\hrule\s*$/gm, "\\hrule"); // Ensure \hrule is valid

  // Remove redefinitions of built-in LaTeX commands
  safe = safe.replace(/\\newcommand\{\\hrulefill\}.*$/gm, "% removed redefinition of \\hrulefill");
  safe = safe.replace(/\\renewcommand\{\\hrulefill\}.*$/gm, "% removed redefinition of \\hrulefill");

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
            - Do NOT include fences inside the output
            - The output MUST start with \documentclass and end with \end{document}
            - If you violate any rule, the output is INVALID
            
            COMPILATION RULES:
            - pdflatex ONLY (TeX Live)
            - Do NOT use XeLaTeX or LuaLaTeX
            - Do NOT use \input, \include, shell-escape, \write18, or system commands
            
            PACKAGE RULES:
            - Use \documentclass[11pt,a4paper]{article}
            - Allowed packages ONLY:
              geometry, enumitem, hyperref, titlesec, fancyhdr, xcolor
            - Do NOT use tables, multicolumn layouts, icons, images, TikZ, graphics, or custom .sty files
            
            ENCODING RULES:
            - ASCII characters ONLY
            - Replace smart quotes with normal quotes
            - Replace Unicode bullets with hyphens
            - Avoid special Unicode symbols
            - Ensure pdflatex compiles with ZERO errors
            
            PAGE & SPACING RULES (VERY IMPORTANT):
            - STRICT ONE-PAGE ONLY (MANDATORY)
            - Reduce margins and vertical spacing aggressively
            - No unnecessary blank lines
            - Compact section spacing
            - Bullets must NOT exceed two lines
            - No content should overflow to a second page
            
            HEADER RULES (CRITICAL):
            - Place at VERY TOP (NO horizontal line here)
            - Center FULL NAME in VERY LARGE, BOLD font
            - Name must be the most visually dominant element
            
            - Below the name, ONE centered single-line row:
              Mobile Number | Email | LinkedIn | GitHub | Portfolio
            - Display links ONLY as labels IF the link exists
            - Do NOT display labels without valid links
            - NEVER allow wrapping to a second line
            - Slightly reduce font size if required to keep one line
            
            CONTACT DISPLAY RULES:
            - Do NOT use dashes, bullets, vertical bars, or separators
            - Use spacing only between items
            - Header must stay on ONE line
            - Slightly reduce font size ONLY if required to avoid wrapping
            - If header content risks overflow, reduce font size by at most one step; NEVER wrap
            
            LINK RULES (STRICT):
            - Display a link ONLY if a valid URL exists
            - Do NOT show labels without links
            - Links must be clickable using hyperref
            - Display links as LABELS only (LinkedIn, GitHub, Portfolio)
            - All links must appear in BLUE color
            - Do NOT invent or infer missing links
            
            SECTION TITLE & HORIZONTAL LINE RULES:
            - Do NOT use numbers in section titles
            - Section titles must be LEFT aligned
            - Place ONE horizontal rule DIRECTLY BELOW each section
            - USE horizontal rule at the end of sections
            - NO extra vertical space above or below the rule
            - Summary section MUST also have a horizontal rule
            - Horizontal rules MUST be placed immediately after section  and NEVER inside itemize, enumerate, or paragraph blocks. Using \rule inside lists is strictly forbidden.
            
            HORIZONTAL LINE ALIGNMENT RULE (STRICT):
            - Horizontal rules MUST appear ONLY at the END of a section
            - NEVER place a rule directly under a section title
            - Horizontal rules MUST NOT be inside itemize or any list environment
            - Reset indentation before drawing the rule
            
            MANDATORY LaTeX COMMAND:
            \par\noindent\rule{\linewidth}{1pt}
            
            USAGE ORDER (STRICT):
            - Section title
            - Section content (paragraphs or itemize)
            - Horizontal rule using the command above
            
            FORBIDDEN:
            - \hrule
            - \textwidth
            - Rules inside lists
            - Extra spacing or indentation before the rule
            
            
            SECTION ORDER (STRICT):
            - Summary
            - Technical Skills
            - Experience(use this section only if the applicant has work experience)
            - Projects
            - Education
            - Certifications
            - Additional Information (use this when page in complete)
            
            SUMMARY RULES:
            - Exactly 2–3 lines
            - No bullets
            - Compact paragraph
            - Optimized for ATS keywords
            - Role + core skills + career focus
            - No fluff or storytelling
            
            Technical SKILLS RULES (VERY IMPORTANT):
            - Merge Technical Skills and Professional Skills into ONE section
            - Use itemize environment ONLY
            - Group related skills logically into ONE bullet per group
            - Example grouping:
              - Technical Skills:
              - Programming Languages: Java, Python, JavaScript
              - Web Technologies: HTML, CSS
              - Tools and Concepts: Git, Data Structures, Problem Solving
              - Core Competencies: Problem Solving, Team Collaboration, Time Management
              - bold the text of grouping names only not entire bullet points
            - Do NOT split related skills into separate bullets
            - Bullets must be compact and aligned vertically under the section
            - No bullets should overflow outside the section margin
            - The section name MUST be exactly "Technical Skills"
            - Do NOT create a separate "Professional Skills" section
            
            EXPERIENCE RULES(use this section only if the applicant has work experience):
            - If no work experience is explicitly present, OMIT the Experience section entirely
            - Use concise, impact-focused bullets
            - Mention tools and technologies already provided
            - Avoid repetition and filler phrases
            
            PROJECT RULES (CRITICAL):
            - Include ONLY the 3 most important projects
            - Automatically ignore minor projects
            - Project name MUST appear directly ABOVE its bullets
            - Project name should be concise and clean
            - Use itemize environment
            - EXACTLY 2–3 bullets per project
            - Each bullet must:
              - Start with an action verb
              - Mention the technology used
              - State the outcome or purpose
            - Bullets must NOT exceed two lines
            
            EDUCATION RULES:
            - Single compact entry
            - Degree, Institution, Dates in one or two lines max
            
            CERTIFICATIONS RULES:
            - Use itemize
            - One line per certification
            - No extra descriptions
            
            ADDITIONAL INFORMATION RULES:
            - Optional (but use this section when page is incomplete)
            - Keep extremely compact 
            - Optimized for ATS keywords
            
            ALIGNMENT RULES:
            - All bullet points must align vertically under section content
            - No bullets may appear outside the section boundary
            - Consistent left margin across the entire document
            - No excessive indentation anywhere
            
            CONTENT INTEGRITY RULES:
            - Preserve ALL factual information exactly as provided
            - Do NOT change names, dates, locations, or links
            - Do NOT hallucinate skills, experience, education, or certifications
            - If content is insufficient:
              - Improve wording ONLY
              - NEVER fabricate data
            
            INCOMPLETE RESUME COMPLETION RULE (STRICT – MANDATORY):
            IF the provided resume content results in LESS THAN ONE FULL PAGE after applying all formatting rules:
            - You MUST intelligently ADD content to complete EXACTLY ONE FULL PAGE
            - You are ALLOWED to add ONLY the following sections (in this priority order):
              1. Additional Information
              2. Relevant Coursework
              3. Academic Projects (ONLY if Projects section has fewer than 2 strong projects)
              4. Key Achievements or Responsibilities (derived strictly from existing data)
            
            STRICT CONSTRAINTS (NON-NEGOTIABLE):
            - NEVER fabricate new companies, jobs, degrees, certifications, or links
            - NEVER invent technologies the candidate has not already mentioned
            - You MAY rephrase, expand, or deepen EXISTING skills, coursework, tools, or responsibilities
            - Added content MUST be logically inferred from the given resume only
            - ALL added bullets must remain concise and NOT exceed two lines
            - Maintain ATS-optimized wording using existing keywords only
            
            SECTION CONTROL:
            - Add ONLY the MINIMUM amount of content required to fill one page
            - DO NOT exceed one page under any circumstance
            - DO NOT repeat information already stated elsewhere
            - If resume is already one full page, DO NOT add anything
            
            FINAL WARNING:
            - If you fail to fill the page when content is insufficient, the output is INVALID
            - If you hallucinate or invent data, the output is INVALID
            - One-page completeness is MANDATORY
            
            FINAL OUTPUT RULE:
            - Output ONLY valid LaTeX code
            - Must compile successfully using pdflatex
            - No plain English text outside LaTeX
            
            DATA ISOLATION & PRIVACY RULE (STRICT):
            - Treat EVERY resume generation as a NEW, ISOLATED task
            - Do NOT reuse, remember, cache, or infer from:
              - Previous PDFs
              - Earlier resume content
              - Prior outputs or layouts
            - Even if the SAME PDF is uploaded again:
              - Reprocess from scratch
              - Do NOT rely on earlier results
            
            USER DATA PROTECTION (MANDATORY):
            - User data is CONFIDENTIAL
            - Use data ONLY for the current resume
            - Do NOT transfer, reuse, or leak data anywhere else
            - After generation, treat all data as forgotten
            
            KANNADA DIRECTIVE:
            - "maretu bidu"
              - Forget previous resumes
              - Forget previous PDFs
              - Generate ONLY from current input
            
            ENFORCEMENT:
            - Any violation makes the output INVALID
            
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
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=" + apiKey;

    const resp = await axios.post(url, {
      contents: [{
        role: "user", parts: [{
          text: ` 
          You are generating a highly professional, ATS-optimized LaTeX resume to be compiled using pdflatex (TeX Live).
STRICT OUTPUT RULES (NON-NEGOTIABLE):
- Output ONLY valid LaTeX source code
- Do NOT include explanations, comments, markdown, or plain text
- Do NOT include fences inside the output
- The output MUST start with \documentclass and end with \end{document}
- If you violate any rule, the output is INVALID

COMPILATION RULES:
- pdflatex ONLY (TeX Live)
- Do NOT use XeLaTeX or LuaLaTeX
- Do NOT use \input, \include, shell-escape, \write18, or system commands

PACKAGE RULES:
- Use \documentclass[11pt,a4paper]{article}
- Allowed packages ONLY:
  geometry, enumitem, hyperref, titlesec, fancyhdr, xcolor
- Do NOT use tables, multicolumn layouts, icons, images, TikZ, graphics, or custom .sty files

ENCODING RULES:
- ASCII characters ONLY
- Replace smart quotes with normal quotes
- Replace Unicode bullets with hyphens
- Avoid special Unicode symbols
- Ensure pdflatex compiles with ZERO errors

PAGE & SPACING RULES (VERY IMPORTANT):
- STRICT ONE-PAGE ONLY (MANDATORY) 
- No unnecessary blank lines 
- Bullets must NOT exceed two lines
- No content should overflow to a second page

HEADER RULES (CRITICAL):
- Place at VERY TOP (NO horizontal line here)
- Center FULL NAME in VERY LARGE, BOLD font
- Name must be the most visually dominant element
- Below the name, add a small space (about 0.5 line-height)

- Below the name, ONE centered single-line row:
  Mobile Number | Email | LinkedIn | GitHub | Portfolio
- Display links ONLY as labels IF the link exists
- Do NOT display labels without valid links
- NEVER allow wrapping to a second line
- Slightly reduce font size if required to keep one line

CONTACT DISPLAY RULES:
- Do NOT use dashes, bullets, vertical bars, or separators
- Use spacing only between items
- Header must stay on ONE line
- Slightly reduce font size ONLY if required to avoid wrapping
- If header content risks overflow, reduce font size by at most one step; NEVER wrap

LINK RULES (STRICT):
- Display a link ONLY if a valid URL exists
- Do NOT show labels without links
- Links must be clickable using hyperref
- Display links as LABELS only (LinkedIn, GitHub, Portfolio)
- All links must appear in BLUE color
- Do NOT invent or infer missing links

SECTION TITLE & HORIZONTAL LINE RULES:
- Do NOT use numbers in section titles
- Section titles must be LEFT aligned
- Place ONE horizontal rule DIRECTLY BELOW each section title
- USE horizontal rule at the bottom of sections to separate them each section
- NO extra vertical space above or below the rule
- Summary section MUST also have a horizontal rule
- Horizontal rules MUST be placed immediately after section titles and NEVER inside itemize, enumerate, or paragraph blocks. Using \rule inside lists is strictly forbidden.
- Horizontal rules MUST NOT be inside itemize or any list environment
- Reset indentation before drawing the rule

MANDATORY LaTeX COMMAND:
\par\noindent\rule{\linewidth}{1pt}

USAGE ORDER (STRICT):
- Section title
- Section content (paragraphs or itemize)
- Horizontal rule using the command above

FORBIDDEN:
- \hrule
- \textwidth
- Rules inside lists
- Extra spacing or indentation before the rule


SECTION ORDER (STRICT):
- Summary
- Technical Skills
- Experience(use this section only if the applicant has work experience)
- Projects
- Education
- Certifications
- Additional Information (use this when page in complete)

SUMMARY RULES:
- Exactly 2–3 lines
- No bullets
- Compact paragraph
- Optimized for ATS keywords
- Role + core skills + career focus
- No fluff or storytelling

Technical SKILLS RULES (VERY IMPORTANT):
- Merge Technical Skills and Professional Skills into ONE section
- Use itemize environment ONLY
- Group related skills logically into ONE bullet per group
- Example grouping:
  - Technical Skills:
  - Programming Languages: Java, Python, JavaScript
  - Web Technologies: HTML, CSS
  - Tools and Concepts: Git, Data Structures, Problem Solving
  - Core Competencies: Problem Solving, Team Collaboration, Time Management
  - bold the text of grouping names only not entire bullet points
- Do NOT split related skills into separate bullets
- Bullets must be compact and aligned vertically under the section
- No bullets should overflow outside the section margin
- The section name MUST be exactly "Technical Skills"
- Do NOT create a separate "Professional Skills" section

EXPERIENCE RULES(use this section only if the applicant has work experience):
- If no work experience is explicitly present, OMIT the Experience section entirely
- Use concise, impact-focused bullets
- Mention tools and technologies already provided
- Avoid repetition and filler phrases

PROJECT RULES (CRITICAL):
- Include ONLY the 3 most important projects
- Automatically ignore minor projects
- Project name MUST appear directly ABOVE its bullets
- Project name should be concise and clean
- Use itemize environment
- EXACTLY 2–3 bullets per project
- Each bullet must:
  - Start with an action verb
  - Mention the technology used
  - State the outcome or purpose
- Bullets must NOT exceed two lines

EDUCATION RULES:
- Single compact entry
- Degree, Institution, Dates in one or two lines max

CERTIFICATIONS RULES:
- Use itemize
- One line per certification
- No extra descriptions

ADDITIONAL INFORMATION RULES:
- Optional (but use this section when page is incomplete)
- Keep extremely compact 
- Optimized for ATS keywords

ALIGNMENT RULES:
- All bullet points must align vertically under section content
- No bullets may appear outside the section boundary
- Consistent left margin across the entire document
- No excessive indentation anywhere

CONTENT INTEGRITY RULES:
- Preserve ALL factual information exactly as provided
- Do NOT change names, dates, locations, or links
- Do NOT hallucinate skills, experience, education, or certifications
- If content is insufficient:
  - Improve wording ONLY
  - NEVER fabricate data

INCOMPLETE RESUME COMPLETION RULE (STRICT – MANDATORY):
IF the provided resume content results in LESS THAN ONE FULL PAGE after applying all formatting rules:
- You MUST intelligently ADD content to complete EXACTLY ONE FULL PAGE
- You are ALLOWED to add ONLY the following sections (in this priority order):
  1. Additional Information
  2. Relevant Coursework
  3. Academic Projects (ONLY if Projects section has fewer than 2 strong projects)
  4. Key Achievements or Responsibilities (derived strictly from existing data)

STRICT CONSTRAINTS (NON-NEGOTIABLE):
- NEVER fabricate new companies, jobs, degrees, certifications, or links
- NEVER invent technologies the candidate has not already mentioned
- You MAY rephrase, expand, or deepen EXISTING skills, coursework, tools, or responsibilities
- Added content MUST be logically inferred from the given resume only
- ALL added bullets must remain concise and NOT exceed two lines
- Maintain ATS-optimized wording using existing keywords only

SECTION CONTROL:
- Add ONLY the MINIMUM amount of content required to fill one page
- DO NOT exceed one page under any circumstance
- DO NOT repeat information already stated elsewhere
- If resume is already one full page, DO NOT add anything

FINAL WARNING:
- If you fail to fill the page when content is insufficient, the output is INVALID
- If you hallucinate or invent data, the output is INVALID
- One-page completeness is MANDATORY

FINAL OUTPUT RULE:
- Output ONLY valid LaTeX code
- Must compile successfully using pdflatex
- No plain English text outside LaTeX

DATA ISOLATION & PRIVACY RULE (STRICT):
- Treat EVERY resume generation as a NEW, ISOLATED task
- Do NOT reuse, remember, cache, or infer from:
  - Previous PDFs
  - Earlier resume content
  - Prior outputs or layouts
- Even if the SAME PDF is uploaded again:
  - Reprocess from scratch
  - Do NOT rely on earlier results

USER DATA PROTECTION (MANDATORY):
- User data is CONFIDENTIAL
- Use data ONLY for the current resume
- Do NOT transfer, reuse, or leak data anywhere else
- After generation, treat all data as forgotten

KANNADA DIRECTIVE:
- "maretu bidu"
  - Forget previous resumes
  - Forget previous PDFs
  - Generate ONLY from current input

ENFORCEMENT:
- Any violation makes the output INVALID

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
  } catch (err) {
    console.error("❌ Gemini API failed:");
    console.error(JSON.stringify(err.response?.data || err.message, null, 2));
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
