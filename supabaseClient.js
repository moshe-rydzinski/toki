import { createClient } from "@supabase/supabase-js";

export function resolveSupabaseConfig(env) {
  const source = env || {};
  const url = source.VITE_SUPABASE_URL;
  const key = source.VITE_SUPABASE_PUBLISHABLE_KEY || source.VITE_SUPABASE_ANON_KEY;
  return {
    url: typeof url === "string" ? url.trim() : "",
    key: typeof key === "string" ? key.trim() : "",
  };
}

const config = resolveSupabaseConfig(import.meta.env);
const browserMock =
  typeof globalThis !== "undefined" &&
  typeof globalThis.window !== "undefined" &&
  globalThis.window.__TOKI_SUPABASE_MOCK__
    ? globalThis.window.__TOKI_SUPABASE_MOCK__
    : null;

export const hasSupabaseConfig = Boolean(browserMock || (config.url && config.key));
export const supabase = browserMock || (hasSupabaseConfig ? createClient(config.url, config.key) : null);
