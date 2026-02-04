
import { createClient } from '@supabase/supabase-js';

// NOTE: In a production environment, these should be environment variables.
// Use placeholders if env vars are missing to prevent the "supabaseUrl is required" error on startup.
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'placeholder';

if (supabaseUrl === 'https://placeholder.supabase.co') {
  console.warn('Supabase URL is missing. App will run in offline/demo mode (requests will fail).');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
