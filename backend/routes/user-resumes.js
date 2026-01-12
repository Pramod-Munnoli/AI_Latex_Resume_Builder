const express = require('express');
const router = express.Router();

// Helper function to verify Supabase JWT token
function getAuthToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}

// Fetch all user resumes for the authenticated user
router.get('/user-resumes', async (req, res) => {
    try {
        const token = getAuthToken(req);
        if (!token) {
            return res.status(401).json({
                error: 'Unauthorized',
                details: 'Please log in to view your resumes'
            });
        }

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        // Verify user is authenticated
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({
                error: 'Invalid token',
                details: 'Please log in again'
            });
        }

        // Fetch user's resumes
        const { data, error } = await supabase
            .from('user_resumes')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Supabase error fetching user resumes:', error);
            return res.status(500).json({
                error: 'Failed to fetch resumes',
                details: error.message
            });
        }

        res.json({ resumes: data || [] });
    } catch (err) {
        console.error('Error in /api/user-resumes GET:', err);
        res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

// Fetch a specific user resume by template ID
router.get('/user-resumes/by-template/:templateId', async (req, res) => {
    try {
        const token = getAuthToken(req);
        if (!token) {
            return res.status(401).json({
                error: 'Unauthorized',
                details: 'Please log in to view your resume'
            });
        }

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({
                error: 'Invalid token',
                details: 'Please log in again'
            });
        }

        const { data, error } = await supabase
            .from('user_resumes')
            .select('*')
            .eq('user_id', user.id)
            .eq('template_id', req.params.templateId)
            .maybeSingle();

        if (error) {
            console.error('Supabase error fetching user resume:', error);
            return res.status(500).json({
                error: 'Failed to fetch resume',
                details: error.message
            });
        }

        res.json({ resume: data });
    } catch (err) {
        console.error('Error in /api/user-resumes/by-template/:templateId:', err);
        res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

// Save or update a user resume
router.post('/user-resumes', async (req, res) => {
    try {
        const token = getAuthToken(req);
        if (!token) {
            return res.status(401).json({
                error: 'Unauthorized',
                details: 'Please log in to save your resume'
            });
        }

        const { templateId, templateName, latexCode } = req.body;

        if (!templateName || !latexCode) {
            return res.status(400).json({
                error: 'Missing required fields',
                details: 'templateName and latexCode are required'
            });
        }

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({
                error: 'Invalid token',
                details: 'Please log in again'
            });
        }

        // Upsert: Insert if new, update if exists
        const { data, error } = await supabase
            .from('user_resumes')
            .upsert({
                user_id: user.id,
                template_id: templateId || null,
                template_name: templateName,
                latex_code: latexCode,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,template_id'
            })
            .select()
            .single();

        if (error) {
            console.error('Supabase error saving user resume:', error);
            return res.status(500).json({
                error: 'Failed to save resume',
                details: error.message
            });
        }

        res.json({
            success: true,
            message: 'Resume saved successfully',
            resume: data
        });
    } catch (err) {
        console.error('Error in /api/user-resumes POST:', err);
        res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

module.exports = router;
