const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let client = null;

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase no configurado. Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}

module.exports = {
  getSupabase,
  isSupabaseConfigured,
};
