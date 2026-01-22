const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Admin client with service role key
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * DELETE /api/user/delete-account
 * Permanently delete the authenticated user's account
 */
router.delete('/delete-account', async (req, res) => {
    try {
        // Get the authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized - No token provided' });
        }

        const token = authHeader.replace('Bearer ', '');

        // Verify the user's JWT token
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Unauthorized - Invalid token' });
        }

        const userId = user.id;

        // 1. Delete user's data from custom database tables
        // This is necessary because ON DELETE CASCADE might not be active or reliable
        console.log(`Cleaning up data for user: ${userId}`);

        try {
            // Delete from user_resumes
            const { error: resumeError } = await supabaseAdmin
                .from('user_resumes')
                .delete()
                .eq('user_id', userId);

            if (resumeError) console.warn('Warning: Could not delete user_resumes:', resumeError.message);

            // Delete from user_emails (if it exists)
            const { error: emailError } = await supabaseAdmin
                .from('user_emails')
                .delete()
                .eq('user_id', userId);

            if (emailError) console.warn('Warning: Could not delete user_emails:', emailError.message);

            // Delete user's storage folder if it exists
            const { data: storageFiles } = await supabaseAdmin.storage.from('resumes').list(userId);
            if (storageFiles && storageFiles.length > 0) {
                const paths = storageFiles.map(f => `${userId}/${f.name}`);
                await supabaseAdmin.storage.from('resumes').remove(paths);
            }
        } catch (cleanupError) {
            console.warn('Non-critical cleanup error:', cleanupError.message);
        }

        // 2. Finally, delete the user account from Supabase Auth
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) {
            console.error('Error deleting user from Auth:', deleteError);
            return res.status(500).json({
                error: 'Failed to delete account',
                details: deleteError.message
            });
        }

        // Success
        res.json({
            success: true,
            message: 'Account permanently deleted'
        });

    } catch (error) {
        console.error('Account deletion error:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
});

module.exports = router;
