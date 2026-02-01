const axios = require("axios");
const fs = require("fs");
const path = require("path");
const GROQ_KEYS = [
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY
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

async function generateLatex(text) {
  const groq = await generateViaGroq(text);
  if (groq && /\\documentclass[\s\S]*\\end\{document\}/.test(groq)) {
    return sanitizeLatex(stripBadUnicode(extractLatex(stripMarkdownFences(groq))));
  }

  const gemini = await generateViaGemini(text);
  if (gemini && /\\documentclass[\s\S]*\\end\{document\}/.test(gemini)) {
    return sanitizeLatex(stripBadUnicode(extractLatex(stripMarkdownFences(gemini))));
  }

  console.warn("⚠️ Using local fallback");
  return sanitizeLatex(basicTemplateFromText(text));
}

async function generateLatexWithSource(text) {
  const groq = await generateViaGroq(text);
  if (groq) {
    const cleaned = sanitizeLatex(stripBadUnicode(extractLatex(stripMarkdownFences(groq))));
    // Verify it's valid LaTeX before returning
    if (/\\documentclass[\s\S]*\\end\{document\}/.test(cleaned)) {
      return { latex: cleaned, source: "groq" };
    }
  }

  const gemini = await generateViaGemini(text);
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

module.exports = {
  generateLatex,
  generateLatexWithSource,
  sanitizeLatex,
  escapeLatex,
  chatWithAI
};


/* ================= GROQ ATS-OPTIMIZED GENERATOR ================= */
async function generateViaGroq(text) {
  if (GROQ_KEYS.length === 0) return null;

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
    - Include both spelled-out terms AND acronyms: "Application Programming Interface (API)".

2.  **STANDARD SECTION HEADINGS** (Use ONLY these exact names):
    - "Professional Summary" (NOT "About Me", "Profile", or "Objective")
    - "Skills" or "Technical Skills" (NOT "Core Competencies" alone)
    - "Experience" or "Work Experience" (NOT "Career History" or "Employment")
    - "Education"
    - "Projects"
    - "Certifications"
    - "Awards" or "Honors"

3.  **QUANTIFIABLE ACHIEVEMENTS** (STAR Method):
    - EVERY bullet point MUST include measurable metrics where possible.
    - Use numbers, percentages, dollar amounts, team sizes, timeframes.
    - GOOD: "Reduced API response time by 40%, handling 10,000+ daily requests"
    - GOOD: "Led team of 5 developers to deliver project 2 weeks ahead of schedule"
    - BAD: "Improved system performance" (no metrics)
    - BAD: "Worked on API development" (no impact shown)

4.  **ACTION VERBS**: Start EVERY bullet with strong action verbs:
    - Technical: Developed, Engineered, Implemented, Architected, Optimized, Automated, Debugged, Deployed, Integrated, Migrated
    - Leadership: Led, Managed, Coordinated, Mentored, Directed, Supervised, Spearheaded
    - Achievement: Achieved, Exceeded, Improved, Increased, Reduced, Streamlined, Accelerated

5.  **REVERSE CHRONOLOGICAL ORDER**: 
    - List ALL experiences with most recent FIRST.
    - Use consistent date format: "MMM YYYY - MMM YYYY" or "MMM YYYY - Present".

6.  **SIMPLE ATS-PARSEABLE FORMAT**:
    - Single-column layout ONLY (no tables, no multi-column, no text boxes).
    - Linear top-to-bottom reading order.
    - No decorative graphics or icons.
    - Use standard bullet points (\\item in LaTeX).

7.  **JOB TITLE CLARITY**: 
    - Use industry-standard job titles (e.g., "Software Engineer" NOT "Code Ninja").
    - Match titles to what ATS systems search for.

8.  **SKILLS SECTION OPTIMIZATION**:
    - Group skills by category: Languages, Frameworks, Databases, Tools, Cloud, etc.
    - List skills from most relevant/proficient to least.
    - Include skill proficiency levels if provided.

═══════════════════════════════════════════════════════════════
                    CONTENT RULES
═══════════════════════════════════════════════════════════════

9.  **PROJECT RULE**: Include maximum 3 projects IF PROVIDED. If NO projects provided, create EXACTLY 2 relevant projects based on user skills. DO NOT EXCEED 2 DUMMY PROJECTS.

10. **EXPERIENCE RULE**: Include ALL work experiences. If NO experience provided, create a "Personal Projects" or "Freelance Experience" section with 3 high-impact bullets. Never write "This section is omitted".

11. **PROFESSIONAL SUMMARY**: Write 3-4 lines that:
    - Mention years of experience (or "Recent graduate" / "Aspiring professional").
    - Highlight 2-3 key technical skills matching common job requirements.
    - Include a quantifiable achievement using metrics (e.g., "Increased efficiency by 25%+", "Handled 100+ daily tickets").
    - Use symbols like % and + to highlight growth and scale.
    - End with career objective or value proposition.

12. **DYNAMIC PAGE LENGTH RULE**: 
    - **Minimal User Data**: If the user provides very little data, you MUST creatively expand the resume to fill exactly ONE FULL PAGE. Create 3-4 detailed "Personal Projects", add a comprehensive "Relevant Coursework" section (12+ subjects), and expand the "Professional Summary" to ensure the PDF is visually full from top to bottom.
    - **Extensive User Data**: If the user provides a lot of data, DO NOT force it into one page. Allow it to extend naturally to 1.5 or 2 pages. Ensure important sections (Professional Summary, Skills, Experience) start on the first page.
    - **NO GAPS**: Regardless of length, the content must feel dense and professional without large awkward blank spaces.

13. **ONE-PAGE FULLNESS** - Use these ADDITIONAL SECTIONS to fill the page (choose based on user data):
    - **Core Competencies**: List 4-6 key professional strengths or domain expertise areas (e.g., Agile, Cloud Architecture).
    - **Professional Development**: Recent trainings, seminars, or continuing education courses.
    - **Relevant Coursework**: EXACTLY 4 most relevant technical subjects based on the user's field.
    - **Technical Interests**: Areas of focus (AI/ML, Cloud Computing, Full-Stack, Mobile Dev, etc.).
    
    1. Professional Summary (ALWAYS)
    2. Core Competencies (if page not full)
    3. Skills (ALWAYS)
    4. Experience (ALWAYS, use Personal Projects if no work experience)
    5. Education (ALWAYS)
    6. Projects (Include 2-3 if provided)
    7. Certifications (if provided)
    8. Languages (if multilingual)
    9. Achievements/Awards (if provided)
    10. Publications & Open Source (if provided)
    11. Leadership & Extracurricular (if provided)
    12. Professional Affiliations (if provided)
    13. Professional Development (if provided)
    14. Conferences & Workshops (if provided)
    15. Volunteer Experience (if provided)
    16. Relevant Coursework (part of Education section)
    17. Technical Interests (only if page still not full)

═══════════════════════════════════════════════════════════════
                    LATEX RULES
═══════════════════════════════════════════════════════════════

13. **LATEX SYNTAX**: Every \\begin{itemize} MUST be closed with \\end{itemize} before starting a new section. CRITICAL for compilation.

14. **ESCAPE CHARACTERS**: Properly escape: &, %, $, #, _, {, }, ^, ~, \\.

15. **ADDRESS FORMAT**: Shorten to "City, State" or "City, Country" only.

16. **MISSING LINKS**: Use professional placeholders if not provided:
    - "\\href{https://linkedin.com/in/username}{LinkedIn}"
    - "\\href{https://github.com/username}{GitHub}"
    - "\\href{https://portfolio.com/username}{Portfolio}"

17. **OUTPUT**: Return ONLY valid LaTeX code. No markdown fences, no explanations.

18. **PACKAGES**: Use ONLY packages defined in the template. Do NOT add new packages.

19. **NO COMMENTS**: Do NOT include any LaTeX comments (lines starting with %). Comments break compilation when content is on a single line.

20. **FORMATTING**: Use newlines and indentation to make the LaTeX code readable. Each section, environment (itemize), and command (\section, \item, \geometry, etc.) should start on a new line.

═══════════════════════════════════════════════════════════════

USER INFORMATION:
<<<
${text}
>>>

LATEX TEMPLATE (ATS-OPTIMIZED - DO NOT ADD ANY PERCENT SIGN COMMENTS):
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
Proven track record of [Quantifiable Achievement]. 
Skilled in [Technologies matching job requirements]. 
Seeking to leverage [Key Strengths] to [Value Proposition].

\\section*{Skills}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Programming Languages}: Python, JavaScript, Java, C++, etc.
    \\item \\textbf{Frameworks \\& Libraries}: React, Node.js, Django, Spring Boot, etc.
    \\item \\textbf{Databases}: MySQL, PostgreSQL, MongoDB, Redis, etc.
    \\item \\textbf{Tools \\& Platforms}: Git, Docker, AWS, Linux, CI/CD, etc.
\\end{itemize}

\\section*{Experience}
\\textbf{Job Title} $|$ Company Name \\hfill Month Year -- Present
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Developed [feature] using [technology], resulting in [X% improvement/metric].
    \\item Led [initiative] that reduced [metric] by [X%], saving [time/cost].
    \\item Collaborated with [team size] engineers to deliver [project] on schedule.
\\end{itemize}

\\section*{Education}
\\textbf{Degree Name} $|$ Institution Name \\hfill Graduation Date \\\\
\\textit{Relevant Coursework}: Data Structures, Algorithms, Database Systems, Operating Systems, Software Engineering, Computer Networks, Machine Learning, Web Development

\\section*{Projects}
\\textbf{Project Name} $|$ \\textit{Tech Stack} \\hfill \\href{PROJECT_URL}{GitHub}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Built [description] using [technologies] to solve [problem].
    \\item Implemented [feature] that improved [metric] by [X%].
    \\item Deployed on [platform] handling [X users/requests].
\\end{itemize}

\\section*{Certifications}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Certification Name -- Issuing Organization (Year)
\\end{itemize}

\\section*{Languages}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item English (Native), Spanish (Fluent), French (Intermediate)
\\end{itemize}

\\section*{Volunteer Experience}
\\textbf{Role Name} $|$ Organization Name \\hfill Month Year -- Month Year
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Description of contribution or impact.
\\end{itemize}

\\section*{Awards}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Award Name -- Organization (Year)
\\end{itemize}

\\section*{Publications \\& Open Source}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Project/Paper Name} $|$ \\href{LINK}{Link} -- Brief description of impact or stack.
\\end{itemize}

\\section*{Leadership \\& Extracurricular}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Role} $|$ Organization \\hfill Month Year -- Month Year
    \\item Led team of [X] members to organize [Event Name], attended by [Y] participants.
\\end{itemize}

\\section*{Professional Affiliations}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Member, Association for Computing Machinery (ACM) \\hfill 2023 -- Present
    \\item Member, IEEE Computer Society \\hfill 2022 -- Present
\\end{itemize}

\\section*{Core Competencies}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Soft Skills}: Team Leadership, Critical Thinking, Project Management, Agile Methodologies.
    \\item \\textbf{Domain Expertise}: Cloud Architecture, Distributed Systems, Software Design Patterns.
\\end{itemize}

\\section*{Professional Development}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Training/Course Name -- Institution or Platform (Year)
\\end{itemize}

\\section*{Conferences \\& Workshops}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Conference Name} $|$ Role (Attendee/Speaker) \\hfill Location, Year
\\end{itemize}

\\section*{Technical Interests}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item AI/ML, Cloud Computing, Open Source Contribution, Web3, Distributed Systems.
\\end{itemize}

\\end{document}
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
You are a professional LaTeX resume expert specializing in ATS (Applicant Tracking System) optimization. Your task is to create a resume that BOTH looks professional AND passes ATS screening algorithms.

GOAL: Generate a professional, ATS-OPTIMIZED resume. Scale the length based on user data: if data is minimal, MUST fill exactly one full page; if data is extensive, extend naturally to 1.5 or 2 pages.

═══════════════════════════════════════════════════════════════
                    ATS OPTIMIZATION RULES (CRITICAL)
═══════════════════════════════════════════════════════════════

1.  **KEYWORD INTEGRATION**: 
    - Naturally incorporate industry-standard keywords from the user's skills throughout the resume.
    - Mirror exact terminology from common job descriptions (e.g., "Python" not "Py", "JavaScript" not "JS").
    - Include both spelled-out terms AND acronyms: "Application Programming Interface (API)".

2.  **STANDARD SECTION HEADINGS** (Use ONLY these exact names):
    - "Professional Summary" (NOT "About Me", "Profile", or "Objective")
    - "Skills" or "Technical Skills" (NOT "Core Competencies" alone)
    - "Experience" or "Work Experience" (NOT "Career History" or "Employment")
    - "Education"
    - "Projects"
    - "Certifications"
    - "Awards" or "Honors"

3.  **QUANTIFIABLE ACHIEVEMENTS** (STAR Method):
    - EVERY bullet point MUST include measurable metrics where possible.
    - Use numbers, percentages, dollar amounts, team sizes, timeframes.
    - GOOD: "Reduced API response time by 40\\%, handling 10,000+ daily requests"
    - GOOD: "Led team of 5 developers to deliver project 2 weeks ahead of schedule"
    - BAD: "Improved system performance" (no metrics)
    - BAD: "Worked on API development" (no impact shown)

4.  **ACTION VERBS**: Start EVERY bullet with strong action verbs:
    - Technical: Developed, Engineered, Implemented, Architected, Optimized, Automated, Debugged, Deployed, Integrated, Migrated
    - Leadership: Led, Managed, Coordinated, Mentored, Directed, Supervised, Spearheaded
    - Achievement: Achieved, Exceeded, Improved, Increased, Reduced, Streamlined, Accelerated

5.  **REVERSE CHRONOLOGICAL ORDER**: 
    - List ALL experiences with most recent FIRST.
    - Use consistent date format: "MMM YYYY - MMM YYYY" or "MMM YYYY - Present".

6.  **SIMPLE ATS-PARSEABLE FORMAT**:
    - Single-column layout ONLY (no tables, no multi-column, no text boxes).
    - Linear top-to-bottom reading order.
    - No decorative graphics or icons.
    - Use standard bullet points (\\item in LaTeX).

7.  **JOB TITLE CLARITY**: 
    - Use industry-standard job titles (e.g., "Software Engineer" NOT "Code Ninja").
    - Match titles to what ATS systems search for.

8.  **SKILLS SECTION OPTIMIZATION**:
    - Group skills by category: Languages, Frameworks, Databases, Tools, Cloud, etc.
    - List skills from most relevant/proficient to least.
    - Include skill proficiency levels if provided.

═══════════════════════════════════════════════════════════════
                    CONTENT RULES
═══════════════════════════════════════════════════════════════

9.  **PROJECT RULE**: Include maximum 3 projects IF PROVIDED. If NO projects provided, create EXACTLY 2 relevant projects based on user skills. DO NOT EXCEED 2 DUMMY PROJECTS.

10. **EXPERIENCE RULE**: Include ALL work experiences. If NO experience provided, create a "Personal Projects" or "Freelance Experience" section with 3 high-impact bullets. Never write "This section is omitted".

11. **PROFESSIONAL SUMMARY**: Write 3-4 lines that:
    - Mention years of experience (or "Recent graduate" / "Aspiring professional").
    - Highlight 2-3 key technical skills matching common job requirements.
    - Include a quantifiable achievement using metrics (e.g., "Increased efficiency by 25%+", "Handled 100+ daily tickets").
    - Use symbols like % and + to highlight growth and scale.
    - End with career objective or value proposition.

12. **DYNAMIC PAGE LENGTH RULE**: 
    - **Minimal User Data**: If the user provides very little data, you MUST creatively expand the resume to fill exactly ONE FULL PAGE. Create 3-4 detailed "Personal Projects", add a comprehensive "Relevant Coursework" section (12+ subjects), and expand the "Professional Summary" to ensure the PDF is visually full from top to bottom.
    - **Extensive User Data**: If the user provides a lot of data, DO NOT force it into one page. Allow it to extend naturally to 1.5 or 2 pages. Ensure important sections (Professional Summary, Skills, Experience) start on the first page.
    - **NO GAPS**: Regardless of length, the content must feel dense and professional without large awkward blank spaces.

13. **ONE-PAGE FULLNESS** - Use these ADDITIONAL SECTIONS to fill the page (choose based on user data):
    - **Core Competencies**: List 4-6 key professional strengths or domain expertise areas (e.g., Agile, Cloud Architecture).
    - **Professional Development**: Recent trainings, seminars, or continuing education courses.
    - **Relevant Coursework**: EXACTLY 4 most relevant technical subjects based on the user's field.
    - **Technical Interests**: Areas of focus (AI/ML, Cloud Computing, Full-Stack, Mobile Dev, etc.).
    
    1. Professional Summary (ALWAYS)
    2. Core Competencies (if page not full)
    3. Skills (ALWAYS)
    4. Experience (ALWAYS, use Personal Projects if no work experience)
    5. Education (ALWAYS)
    6. Projects (Include 2-3 if provided)
    7. Certifications (if provided)
    8. Languages (if multilingual)
    9. Achievements/Awards (if provided)
    10. Publications & Open Source (if provided)
    11. Leadership & Extracurricular (if provided)
    12. Professional Affiliations (if provided)
    13. Professional Development (if provided)
    14. Conferences & Workshops (if provided)
    15. Volunteer Experience (if provided)
    16. Relevant Coursework (part of Education section)
    17. Technical Interests (only if page still not full)

═══════════════════════════════════════════════════════════════
                    LATEX RULES
═══════════════════════════════════════════════════════════════

13. **LATEX SYNTAX**: Every \\begin{itemize} MUST be closed with \\end{itemize} before starting a new section. CRITICAL for compilation.

14. **ESCAPE CHARACTERS**: Properly escape: &, %, $, #, _, {, }, ^, ~, \\.

15. **ADDRESS FORMAT**: Shorten to "City, State" or "City, Country" only.

16. **MISSING LINKS**: Use professional placeholders if not provided:
    - "\\href{https://linkedin.com/in/username}{LinkedIn}"
    - "\\href{https://github.com/username}{GitHub}"
    - "\\href{https://portfolio.com/username}{Portfolio}"

17. **OUTPUT**: Return ONLY valid LaTeX code. No markdown fences, no explanations.

18. **PACKAGES**: Use ONLY packages defined in the template. Do NOT add new packages.

19. **NO COMMENTS**: Do NOT include any LaTeX comments (lines starting with %). Comments break compilation when content is on a single line.

═══════════════════════════════════════════════════════════════

USER INFORMATION:
<<<
${text}
>>>

LATEX TEMPLATE (ATS-OPTIMIZED - DO NOT ADD ANY PERCENT SIGN COMMENTS):
\\documentclass[11pt,a4paper]{article}
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
Proven track record of [Quantifiable Achievement]. 
Skilled in [Technologies matching job requirements]. 
Seeking to leverage [Key Strengths] to [Value Proposition].

\\section*{Skills}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Programming Languages}: Python, JavaScript, Java, C++, etc.
    \\item \\textbf{Frameworks \\& Libraries}: React, Node.js, Django, Spring Boot, etc.
    \\item \\textbf{Databases}: MySQL, PostgreSQL, MongoDB, Redis, etc.
    \\item \\textbf{Tools \\& Platforms}: Git, Docker, AWS, Linux, CI/CD, etc.
\\end{itemize}

\\section*{Experience}
\\textbf{Job Title} $|$ Company Name \\hfill Month Year -- Present
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Developed [feature] using [technology], resulting in [X\\% improvement/metric].
    \\item Led [initiative] that reduced [metric] by [X\\%], saving [time/cost].
    \\item Collaborated with [team size] engineers to deliver [project] on schedule.
\\end{itemize}

\\section*{Education}
\\textbf{Degree Name} $|$ Institution Name \\hfill Graduation Date \\\\
\\textit{Relevant Coursework}: Data Structures, Algorithms, Database Systems, Operating Systems, Software Engineering, Computer Networks, Machine Learning, Web Development

\\section*{Projects}
\\textbf{Project Name} $|$ \\textit{Tech Stack} \\hfill \\href{PROJECT_URL}{GitHub}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Built [description] using [technologies] to solve [problem].
    \\item Implemented [feature] that improved [metric] by [X\\%].
    \\item Deployed on [platform] handling [X users/requests].
\\end{itemize}

\\section*{Certifications}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Certification Name -- Issuing Organization (Year)
\\end{itemize}

\\section*{Languages}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item English (Native), Spanish (Fluent), French (Intermediate)
\\end{itemize}

\\section*{Volunteer Experience}
\\textbf{Role Name} $|$ Organization Name \\hfill Month Year -- Month Year
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Description of contribution or impact.
\\end{itemize}

\\section*{Awards}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Award Name -- Organization (Year)
\\end{itemize}

\\section*{Publications \\& Open Source}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Project/Paper Name} $|$ \\href{LINK}{Link} -- Brief description of impact or stack.
\\end{itemize}

\\section*{Leadership \\& Extracurricular}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Role} $|$ Organization \\hfill Month Year -- Month Year
    \\item Led team of [X] members to organize [Event Name], attended by [Y] participants.
\\end{itemize}

\\section*{Professional Affiliations}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Member, Association for Computing Machinery (ACM) \\hfill 2023 -- Present
    \\item Member, IEEE Computer Society \\hfill 2022 -- Present
\\end{itemize}

\\section*{Core Competencies}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Soft Skills}: Team Leadership, Critical Thinking, Project Management, Agile Methodologies.
    \\item \\textbf{Domain Expertise}: Cloud Architecture, Distributed Systems, Software Design Patterns.
\\end{itemize}

\\section*{Professional Development}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item Training/Course Name -- Institution or Platform (Year)
\\end{itemize}

\\section*{Conferences \\& Workshops}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item \\textbf{Conference Name} $|$ Role (Attendee/Speaker) \\hfill Location, Year
\\end{itemize}

\\section*{Technical Interests}
\\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
    \\item AI/ML, Cloud Computing, Open Source Contribution, Web3, Distributed Systems.
\\end{itemize}

\\end{document}
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