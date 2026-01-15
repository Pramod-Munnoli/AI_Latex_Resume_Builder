const { sanitizeLatex, stripMarkdownFences } = require("../backend/utils/ai");

const sampleAIResponse = `
Here is your LaTeX resume:

\`\`\`latex
\\documentclass{article}
\\begin{document}
Hello World
\\end{document}
\`\`\`

I hope this helps!
`;

console.log("Original Response:", sampleAIResponse);

const extracted = stripMarkdownFences(sampleAIResponse);
console.log("\n--- Extracted LaTeX ---");
console.log(extracted);

const sanitized = sanitizeLatex(extracted);
console.log("\n--- Sanitized LaTeX ---");
console.log(sanitized);

if (sanitized.startsWith("\\documentclass") && sanitized.endsWith("\\end{document}")) {
    console.log("\n✅ Test Passed: LaTeX correctly extracted and sanitized.");
} else {
    console.log("\n❌ Test Failed: LaTeX extraction or sanitization issue.");
    process.exit(1);
}
