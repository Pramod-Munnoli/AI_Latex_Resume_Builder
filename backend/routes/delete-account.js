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
            // 1a. Delete from AI Builder 'resumes' table
            console.log('Deleting from resumes table...');
            const { error: aiResumesError } = await supabaseAdmin
                .from('resumes')
                .delete()
                .eq('user_id', userId);
            if (aiResumesError) console.warn('Warning: Could not delete from resumes table:', aiResumesError);

            // 1b. Delete from 'user_resumes' (Templates)
            console.log('Deleting from user_resumes table...');
            const { error: resumeError } = await supabaseAdmin
                .from('user_resumes')
                .delete()
                .eq('user_id', userId);
            if (resumeError) console.warn('Warning: Could not delete user_resumes:', resumeError);

            // 1c. Delete from 'user_emails' (Recovery track)
            console.log('Deleting from user_emails table...');
            const { error: emailError } = await supabaseAdmin
                .from('user_emails')
                .delete()
                .eq('user_id', userId);
            if (emailError) console.warn('Warning: Could not delete user_emails:', emailError);

            // 1d. Delete user's storage folder if it exists
            console.log('Cleaning up storage...');
            const { data: storageFiles, error: listError } = await supabaseAdmin.storage.from('resumes').list(userId);

            if (listError) {
                console.warn('Warning: Could not list storage files:', listError);
            } else if (storageFiles && storageFiles.length > 0) {
                const paths = storageFiles.map(f => `${userId}/${f.name}`);
                const { error: removeError } = await supabaseAdmin.storage.from('resumes').remove(paths);
                if (removeError) console.warn('Warning: Could not remove storage files:', removeError);
            }
        } catch (cleanupError) {
            console.error('Critical cleanup error:', cleanupError);
        }

        // 2. Finally, delete the user account from Supabase Auth
        console.log(`Final step: Deleting auth user ${userId}`);
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) {
            console.error('CRITICAL: Failed to delete user from Auth:', deleteError);
            return res.status(500).json({
                error: 'Failed to delete account from Auth service',
                details: deleteError.message,
                code: deleteError.code || 'AUTH_DELETE_ERROR'
            });
        }

        console.log('Account deletion successful');
        // Success
        res.json({
            success: true,
            message: 'Account permanently deleted'
        });

    } catch (error) {
        console.error('Top-level account deletion error:', error);
        res.status(500).json({
            error: 'Internal server error during account deletion',
            details: error.message
        });
    }
});

module.exports = router;
