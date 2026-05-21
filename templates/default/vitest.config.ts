import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@/convex": path.resolve(__dirname, "convex"),
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
