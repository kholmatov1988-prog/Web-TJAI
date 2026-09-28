const env = import.meta.env;

const DEFAULT_SUPABASE_URL = "https://vzvmpoutnnixezmojcwx.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_V9Nh33ziRqlxMCXxnQ41cA_ss5TRl-A";

export const config = Object.freeze({
  supabaseUrl: (env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim().replace(/\/$/, ""),
  supabaseKey: (env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY).trim(),
  googleAuthEnabled: env.VITE_ENABLE_GOOGLE_AUTH === "true",
});

export const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseKey);
