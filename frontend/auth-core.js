/**
 * auth-core.js - Standalone authentication engine.
 * Isolating Supabase auth logic from UI scripts.
 */

(function () {
    "use strict";

    let supabase = null;
    let currentUser = null;

    window.initSupabase = async function (onAuthStateChange) {
        try {
            const resp = await fetch(`${API_BASE}/api/config`);
            if (!resp.ok) throw new Error(`Server responded with ${resp.status}`);
            const config = await resp.json();

            if (config.supabaseUrl && config.supabaseAnonKey) {
                supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
                window._supabase = supabase; // Shared for other scripts

                supabase.auth.onAuthStateChange(async (event, session) => {
                    currentUser = session?.user || null;
                    if (onAuthStateChange) onAuthStateChange(event, session);
                });
                return supabase;
            }
        } catch (err) {
            console.error("Auth Init Error:", err);
            throw err;
        }
    };

    window.checkEmailRegistration = async function (email) {
        if (!supabase) return null;
        const { data, error } = await supabase
            .from('user_emails')
            .select('email')
            .eq('email', email.toLowerCase())
            .maybeSingle();
        return data;
    };

    window.performLogout = async function () {
        if (!supabase) return;
        try {
            const storageKeys = Object.keys(localStorage);
            storageKeys.forEach(key => { if (key.startsWith('sb-')) localStorage.removeItem(key); });
            localStorage.removeItem("ai_resume_user_cache");
            await supabase.auth.signOut();
        } catch (err) {
            console.error("Logout error:", err);
        }
    };

    // ... additional helpers for handleAuth
})();
