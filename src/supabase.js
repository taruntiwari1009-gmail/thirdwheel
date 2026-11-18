import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
export const supabasePublishableKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY;

export const supabaseProjectHost = (() => {
  if (!supabaseUrl) return "";
  try {
    return new URL(supabaseUrl).host;
  } catch (_) {
    return "";
  }
})();

if (!supabaseUrl || !supabasePublishableKey) {
  // Keep tests and non-Supabase utility imports loadable without credentials.
  // The application bootstrap will surface a configuration error before auth routes are used.
}

export const supabase = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const isSupabaseConfigured = Boolean(supabase);

if (supabase && process.env.NODE_ENV !== "test") {
  // The endpoint host is public configuration; never log the publishable key or any secret.
  console.info("[Third Wheel] Supabase backend configured:", supabaseProjectHost || "unknown host");
}
