/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    // Diagnostics is exercised through its API tests. Keeping background
    // telemetry out of component tests preserves each mock's API contract.
    env: { VITE_ALPHA_DIAGNOSTICS: "false", VITE_AUTH_GOOGLE_ENABLED: "true",
      VITE_AUTH_APPLE_ENABLED: "false", VITE_AUTH_EMAIL_ENABLED: "true",
      VITE_SUPABASE_URL: "https://auth.test", VITE_SUPABASE_ANON_KEY: "test-anon-key" }
  }
});
