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

        // Delete user's resumes from storage (if you have any stored files)
        // This is optional - add if you store files in Supabase Storage
        // const { data: files } = await supabaseAdmin.storage.from('resumes').list(userId);
        // if (files && files.length > 0) {
        //     const filePaths = files.map(file => `${userId}/${file.name}`);
        //     await supabaseAdmin.storage.from('resumes').remove(filePaths);
        // }

        // Delete user's data from database tables (if you have any custom tables)
        // Example: await supabaseAdmin.from('user_resumes').delete().eq('user_id', userId);

        // Finally, delete the user account from Supabase Auth
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) {
            console.error('Error deleting user:', deleteError);
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
