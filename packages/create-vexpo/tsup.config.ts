import { cp, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { defineConfig } from "tsup";

import { STRIPPED_DOTFILES, strippedToUnderscore } from "./src/dotfiles.ts";

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
    const ROOT_ONLY_DIRS = ["ios", "android", ".expo", ".tanstack", ".output"];
    const SKIP_DIRS = [
      "node_modules",
      ".claude",
      ".agents",
      ".cursor",
      ".dev",
      "plans",
      "docs",
      ".vexpo-manual-setup",
      ".rebrand-backup",
      "coverage",
      ".vitest-cache",
    ];
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
      /^\.env\.convex\.local$/,
      /^store\.config\.json$/,
      /^\.setup-state\.json$/,
      /^\.setup-state\.json\..*\.tmp$/,
      /^\.DS_Store$/,
      /^skills-lock\.json$/,
      /^LICENSE$/i,
      /^expo-env\.d\.ts$/,
      /^CODEOWNERS$/,
      /^tsconfig\.tsbuildinfo$/,
      /^bun-error\./,
      /\.tgz$/,
      /\.log$/,
      /^package-lock\.json$/,
      /^bun\.lock$/,
      /^bun\.lockb$/,
      /^pnpm-lock\.yaml$/,
      /^yarn\.lock$/,
      /\.bak$/,
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
    for (const name of STRIPPED_DOTFILES) {
      try {
        await rename(join(dest, name), join(dest, strippedToUnderscore(name)));
      } catch {}
    }
    const files = await readdir(dest);
    console.log(`[tsup] copied ${files.length} top-level entries from templates/default`);
  },
});
