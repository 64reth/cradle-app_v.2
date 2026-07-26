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
    env: { VITE_ALPHA_DIAGNOSTICS: "false" }
  }
});
