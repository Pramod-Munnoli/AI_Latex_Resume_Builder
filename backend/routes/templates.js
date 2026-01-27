const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');

// This route fetches all default templates from Supabase
// No authentication required - templates are public
router.get('/templates', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('latex_templates')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Supabase error fetching templates:', error);
            return res.status(500).json({
                error: 'Failed to fetch templates',
                details: error.message
            });
        }

        res.json({ templates: data || [] });
    } catch (err) {
        console.error('Error in /api/templates:', err);
        res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

// Fetch a specific template by ID
router.get('/templates/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('latex_templates')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            console.error('Supabase error fetching template:', error);
            return res.status(404).json({
                error: 'Template not found',
                details: error.message
            });
        }

        res.json({ template: data });
    } catch (err) {
        console.error('Error in /api/templates/:id:', err);
        res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

// Fetch a specific template by Name
router.get('/templates/by-name/:name', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('latex_templates')
            .select('*')
            .eq('template_name', req.params.name)
            .maybeSingle();

        if (error || !data) {
            return res.status(404).json({
                error: 'Template not found'
            });
        }

        res.json({ template: data });
    } catch (err) {
        console.error('Error in /api/templates/by-name/:name:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
