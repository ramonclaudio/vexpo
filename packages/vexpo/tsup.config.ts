import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: "esm",
  target: "node22",
  outDir: "dist",
  clean: true,
  shims: false,
  dts: false,
  sourcemap: false,
  treeshake: true,
  banner: { js: "#!/usr/bin/env node" },
});
