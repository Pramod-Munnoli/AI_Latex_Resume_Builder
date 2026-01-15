/**
 * Template Column Mapping
 * Maps template names to user_resumes database column names
 * Used for the single-row-per-user architecture
 */
const TEMPLATE_COLUMN_MAPPING = {
    'ats-modern': 'ats_template_latex',
    'clean-minimalist': 'minimal_template_latex',
    'academic-excellence': 'academic_template_latex',
    'tech-focused': 'developer_template_latex',
    'student': 'student_template_latex'
};

// Make it available globally
if (typeof window !== 'undefined') {
    window.TEMPLATE_COLUMN_MAPPING = TEMPLATE_COLUMN_MAPPING;
}
