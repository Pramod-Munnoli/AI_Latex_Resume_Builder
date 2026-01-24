const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
    console.log('Testing Supabase Admin connection...');
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
        console.error('Connection failed:', error.message);
    } else {
        console.log('Connection successful! User count:', data.users.length);
    }
}

test();
