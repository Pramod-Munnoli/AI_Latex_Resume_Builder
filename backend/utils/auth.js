const { createClient } = require('@supabase/supabase-js');

/**
 * Extracts and verifies the Supabase user from the Authorization header
 * @param {import('express').Request} req 
 * @returns {Promise<Object|null>} The user object or null
 */
async function getAuthenticatedUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.substring(7);

    try {
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error) {
            console.warn('Supabase Auth error:', error.message);
            return null;
        }

        if (!user) {
            console.warn('No user found for the provided token');
            return null;
        }

        console.log(`Authenticated user: ${user.email} (${user.id})`);
        return user;
    } catch (err) {
        console.error('Auth verification system error:', err);
        return null;
    }
}

module.exports = { getAuthenticatedUser };
