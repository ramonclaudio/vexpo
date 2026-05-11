import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
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
