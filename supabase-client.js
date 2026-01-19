// Supabase Client Configuration
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL или SUPABASE_SERVICE_KEY не установлены в .env файле');
  process.exit(1);
}

// Создаём клиент Supabase с service_role ключом (полный доступ)
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('✅ Supabase client initialized:', supabaseUrl);

module.exports = supabase;
