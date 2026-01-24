const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSchema() {
    console.log('Checking foreign keys for auth.users...');
    const { data, error } = await supabase.rpc('get_foreign_keys', { table_name: 'users', table_schema: 'auth' });
    // Note: get_foreign_keys might not exist. Let's try a direct query on information_schema.

    const { data: fkData, error: fkError } = await supabase.from('resumes').select('*').limit(1);
    console.log('Resumes sample data:', fkData);
    if (fkError) console.error('Resumes table error:', fkError.message);
}

checkSchema();
