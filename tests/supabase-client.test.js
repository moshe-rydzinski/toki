import test from "node:test";
import assert from "node:assert/strict";

import { resolveSupabaseConfig } from "../supabaseClient.js";

test("resolveSupabaseConfig prefers publishable key", () => {
  const config = resolveSupabaseConfig({
    VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_123",
    VITE_SUPABASE_ANON_KEY: "anon_legacy_123",
  });

  assert.equal(config.url, "https://example.supabase.co");
  assert.equal(config.key, "sb_publishable_123");
});

test("resolveSupabaseConfig falls back to anon key", () => {
  const config = resolveSupabaseConfig({
    VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon_legacy_123",
  });

  assert.equal(config.url, "https://example.supabase.co");
  assert.equal(config.key, "anon_legacy_123");
});

test("resolveSupabaseConfig handles missing values", () => {
  const config = resolveSupabaseConfig({});

  assert.equal(config.url, "");
  assert.equal(config.key, "");
});
