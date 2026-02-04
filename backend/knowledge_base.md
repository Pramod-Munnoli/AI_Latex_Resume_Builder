# AI LaTeX Resume Builder - Website Knowledge Base

## Overview
AI LaTeX Resume Builder is a high-performance full-stack application that transforms static PDF resumes into professional, ATS-optimized LaTeX source code. It combines elite AI orchestration with a premium editing experience.

## Key Features
- **Intelligent Dual-AI Engine**: Uses **Groq (Llama 3.3)** for extreme speed and **Gemini (2.0 Flash)** for high-reliability fallback.
- **ATS Optimization (Industry Standard)**:
    - **STAR Method**: AI automatically reformats bullet points to highlight quantifiable achievements.
    - **Standard Headings**: Uses recognized section names (Professional Summary, Experience, etc.) for better parsing.
    - **Single-Column Layout**: Guarantees parseability by 100% of modern Applicant Tracking Systems.
- **Advanced Resume Sections**: Supports extended sections like Leadership & Extracurricular, Professional Affiliations, Conferences & Workshops, Certifications, and Core Competencies.
- **Real-time LaTeX Editor**: Professional-grade editor with side-by-side instant PDF preview.
- **Visual Editor (Hybrid)**: Currently in development and **coming soon**! It will allow for drag-and-drop editing via a field-based interface.
- **Intelligent Versioning**: Switch between "My Saved Version" and the "Original Template" with built-in diffing to preserve your work.
- **Compilation Cache**: MD5-based caching ensures sub-second PDF generation for identical content.
- **Vault-Grade Security**: Uses Supabase for encrypted authentication and isolated user data storage.

## Technical Details
- **UI/UX**: Vanilla JS, HTML5, CSS3. Premium Glassmorphism design with GPU-accelerated animations and Intersection Observer reveals.
- **Infrastructure**: Node.js & Express (Backend), Docker (TeX Live distribution), Vercel (Frontend), Render (Backend Hosting).
- **Core Optimizations**: 
    - **Multi-Key Failover**: Rotates through multiple Groq API keys to bypass rate limits.
    - **Intelligent Sanitizer**: Auto-corrects common AI LaTeX errors (unclosed itemize, escaped chars).
    - **Visual Balance**: Limits "Relevant Coursework" to the top 4 items for a cleaner look.

## Frequently Asked Questions (FAQ)
- **Why should I use this over a Word doc?** LaTeX ensures pixel-perfect formatting that never "breaks" when you add a line. It is the gold standard for professional engineering and academic resumes.
- **How does the AI help?** It doesn't just copy text; it *reconstructs* it. It fixes grammar, suggests action verbs, and scales your content to perfectly fill 1 or 2 pages.
- **Is the PDF downloadable?** Yes, every compilation generates a professional PDF that you can download or print immediately.
- **What if the AI makes a mistake?** Our "Intelligent Sanitizer" catches 99% of LaTeX errors, but if one slips through, you can fix it manually in the Code Editor.
- **Why is the preview so fast?** Thanks to our Compilation Cache, if you revert a change, we show you the previous PDF instantly without hitting the server again.

## Support & Development
Designed and developed by **Pramod Munnoli**. This project is open-source and continuously evolving to include new AI models and resume templates.
