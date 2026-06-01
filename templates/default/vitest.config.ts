import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Metro injects `__DEV__` at bundle time; define it for node so RN/Expo
  // modules that branch on it (e.g. `+native-intent.tsx`) are unit-testable.
  define: {
    __DEV__: "false",
  },
  resolve: {
    alias: {
      "@/convex": path.resolve(__dirname, "convex"),
      "@/assets": path.resolve(__dirname, "assets"),
      "@": path.resolve(__dirname, "src"),
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
