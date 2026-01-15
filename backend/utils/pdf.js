const pdfParseModule = require("pdf-parse");

async function extractTextFromPdf(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Invalid PDF buffer provided");
  }
  const bytes = new Uint8Array(buffer);
  let data;
  if (typeof pdfParseModule === "function") {
    data = await pdfParseModule(bytes);
  } else if (typeof pdfParseModule.PDFParse === "function") {
    const parser = new pdfParseModule.PDFParse(bytes);
    data = await parser.getText();
  } else if (typeof pdfParseModule.default === "function") {
    data = await pdfParseModule.default(bytes);
  } else {
    throw new Error("Unsupported pdf-parse export shape");
  }
  // Basic cleanup: collapse multiple spaces and trim
  const text = (data.text || "")
    .replace(/\t+/g, " ")
    .replace(/\u0000/g, " ")
    .replace(/[ \f\r\v]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return text;
}

module.exports = { extractTextFromPdf };
