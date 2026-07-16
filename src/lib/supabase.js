import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Enable URL token parsing so Supabase picks up the recovery token from
      // password-reset email links (fires a PASSWORD_RECOVERY auth event).
      // Required for the in-app password reset flow.
      detectSessionInUrl: true,
      storageKey: 'hn-auth',
    }
  }
);
