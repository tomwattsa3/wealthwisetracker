import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tpmhckmqccwbhohggvau.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwbWhja21xY2N3YmhvaGdndmF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxOTA1ODAsImV4cCI6MjA4NTc2NjU4MH0.F32n8KkONsovim08FE1MjK0NufSfUWsEtixCYCMPP_Y';

export const supabase = createClient(supabaseUrl, supabaseKey);
