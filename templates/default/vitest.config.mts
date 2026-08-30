import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  // Metro injects `__DEV__` at bundle time; define it for node so RN/Expo
  // modules that branch on it (e.g. `+native-intent.tsx`) are unit-testable.
  define: {
    __DEV__: "false",
  },
  resolve: {
    alias: {
      "@/convex": resolve(import.meta.dirname, "convex"),
      "@/assets": resolve(import.meta.dirname, "assets"),
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "ios/**", ".expo/**", "dist/**"],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
