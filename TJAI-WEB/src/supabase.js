import { createClient } from "@supabase/supabase-js";
import { config, hasSupabaseConfig } from "./config.js";

export const supabase = hasSupabaseConfig
  ? createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export async function getProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from("profiles")
    .select("id,email,display_name,role,blocked_at,created_at")
    .eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}
