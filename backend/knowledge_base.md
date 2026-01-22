# AI LaTeX Resume Builder - Website Knowledge Base

## Overview
AI LaTeX Resume Builder is a sophisticated full-stack application designed to transform unstructured PDF resumes into high-quality, ATS-optimized LaTeX source code.

## Key Features
- **Intelligent AI Reconstruction**: Uses Groq (Llama 3.3) and Gemini (2.0 Flash) to map PDF data to LaTeX structures.
- **Real-time LaTeX Editor**: Side-by-side preview where you see changes instantly.
- **Visual Editor**: Currently in development and **coming soon**! It will allow for drag-and-drop editing.
- **ATS Optimization**: Resumes are structured to be easily readable by Applicant Tracking Systems.
- **Template Gallery**: Multiple professional templates (Modern, Minimal, Student, Developer).
- **Cloud Sync**: Powered by Supabase for secure authentication and data persistence.
- **Zero-Error Compilation**: Backend uses TeX Live (pdflatex) for professional PDF generation.

## Technical Details
- **Frontend**: Vanilla JavaScript, HTML5, CSS3 with a focus on premium aesthetics (Glassmorphism, fluid animations).
- **Backend**: Node.js & Express hosted in Docker with TeX Live distribution.
- **Database**: Supabase PostgreSQL.
- **Storage**: Supabase Storage for binary PDF files.
- **AI Orchestration**: Groq Llama 3.3 is the primary engine for speed, with Gemini as a reliable fallback.

## Frequently Asked Questions (FAQ)
- **How do I use it?** Upload your existing PDF resume, wait for the AI to reconstruct it, and then use the editor to fine-tune it.
- **Is my data safe?** Yes, we use Supabase for secure authentication, and data is isolated per user.
- **What is LaTeX?** It is a high-quality typesetting system used for professional documents. It ensures your resume looks perfect.
- **Can I change templates?** Yes, you can switch between different professional templates in the gallery.
- **Is the resume ATS friendly?** Absolutely. The LaTeX output is designed to be parsed easily by modern ATS systems.
- **What is the Visual Editor?** The Visual Editor is a new feature we're working on that will let you edit your resume visually. It's **coming soon**! For now, please use the professional Code Editor.

## Support & Development
Designed and developed by Pramod Munnoli. The project is open-source and hosted on GitHub.
