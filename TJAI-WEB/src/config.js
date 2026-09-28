const env = import.meta.env;

export const config = Object.freeze({
  supabaseUrl: (env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, ""),
  supabaseKey: (env.VITE_SUPABASE_ANON_KEY || "").trim(),
  googleAuthEnabled: env.VITE_ENABLE_GOOGLE_AUTH === "true",
});

export const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseKey);
