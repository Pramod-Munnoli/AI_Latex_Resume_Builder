
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: __dirname + '/../.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTemplates() {
    const { data, error } = await supabase.from('latex_templates').select('template_name, latex_code');
    if (error) {
        console.error('Error:', error);
    } else {
        data.forEach(t => {
            console.log(`Template: ${t.template_name}, Code exists: ${!!t.latex_code}, Length: ${t.latex_code ? t.latex_code.length : 0}`);
        });
    }
}

checkTemplates();
