import { cp, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node20",
  outDir: "dist",
  clean: true,
  shims: false,
  dts: false,
  sourcemap: false,
  treeshake: true,
  banner: { js: "#!/usr/bin/env node" },
  async onSuccess() {
    const src = join(process.cwd(), "..", "..", "templates", "default");
    const dest = join(process.cwd(), "dist", "templates", "default");
    await rm(dest, { recursive: true, force: true });
    const ROOT_ONLY_DIRS = ["ios", "android", ".expo"];
    const SKIP_DIRS = ["node_modules", ".claude"];
    const SKIP_BASENAME_PATTERNS = [
      /\.p8$/,
      /\.p12$/,
      /\.mobileprovision$/,
      /\.cer$/,
      /^AuthKey_/,
      /^SubscriptionKey_/,
      /^\.env\.local$/,
      /^\.env\.prod$/,
      /^\.env\.production$/,
      /^store\.config\.json$/,
      /^\.setup-state\.json$/,
      /^\.setup-state\.json\..*\.tmp$/,
      /^\.DS_Store$/,
      /^expo-env\.d\.ts$/,
      /^tsconfig\.tsbuildinfo$/,
      /\.tgz$/,
      /\.log$/,
      /^package-lock\.json$/,
      /^bun\.lock$/,
      /^bun\.lockb$/,
      /^pnpm-lock\.yaml$/,
      /^yarn\.lock$/,
    ];
    await cp(src, dest, {
      recursive: true,
      filter: (path) => {
        const rel = path.slice(src.length);
        if (ROOT_ONLY_DIRS.some((s) => rel === `/${s}` || rel.startsWith(`/${s}/`))) {
          return false;
        }
        if (SKIP_DIRS.some((s) => path.includes(`/${s}/`) || path.endsWith(`/${s}`))) {
          return false;
        }
        const base = path.slice(path.lastIndexOf("/") + 1);
        if (SKIP_BASENAME_PATTERNS.some((re) => re.test(base))) return false;
        return true;
      },
    });
    await cp(join(dest, "store.config.example.json"), join(dest, "store.config.json"));
    await rename(join(dest, ".gitignore"), join(dest, "_gitignore"));
    const files = await readdir(dest);
    console.log(`[tsup] copied ${files.length} top-level entries from templates/default`);
  },
});
