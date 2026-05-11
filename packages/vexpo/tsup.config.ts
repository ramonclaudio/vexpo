import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: "esm",
  target: "node20",
  outDir: "dist",
  clean: true,
  shims: false,
  dts: false,
  sourcemap: false,
  treeshake: true,
  banner: ({ format }) => (format === "esm" ? { js: "#!/usr/bin/env node" } : {}),
});
