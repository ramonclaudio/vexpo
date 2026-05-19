import { cp, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { defineConfig } from "tsup";

// Dotfiles npm strips from published tarballs. Renamed to underscore-prefixed
// during build so they ship in the template, then `restoreStrippedDotfiles` in
// src/index.ts swaps them back at scaffold time. Keep in sync with that
// function's `renames` array.
const STRIPPED_DOTFILES = [
  ".gitignore",
  ".env.example",
  ".oxfmtrc.json",
  ".oxlintrc.json",
  ".editorconfig",
  ".gitattributes",
  ".easignore",
  ".fingerprintignore",
  ".env.convex.local",
];

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
    // `tsup`'s top-level `clean: true` wipes the entry-file outDir before the
    // build, but `onSuccess` runs after, and a stale prior `dist/templates/`
    // tree would have been recreated by the time we copy. `cp(..., recursive)`
    // copies but doesn't prune. so a file we deleted from `templates/default/`
    // would linger in `dist/templates/default/` across builds. Wipe the
    // template destination explicitly here to keep the published tarball in
    // sync with the source.
    await rm(dest, { recursive: true, force: true });
    // Defensive filters. `.gitignore` exists in the template but rsync/cp
    // doesn't honor it, so we belt-and-suspenders against:
    //  - generated dirs (node_modules, ios, android, .expo, .tanstack, .output)
    //  - personal Claude Code / agent config (.claude, .agents, .cursor)
    //  - working notes the template author keeps locally (plans, docs, .vexpo-manual-setup, .rebrand-backup)
    //  - test/coverage outputs (coverage, .vitest-cache)
    //  - Apple secret keys (*.p8, *.p12, *.mobileprovision, *.cer, AuthKey_*, SubscriptionKey_*)
    //  - local env / state files (.env.local, .env.prod, .setup-state.json)
    //  - generated files (expo-env.d.ts, tsconfig.tsbuildinfo, bun-error.*, *.log, *.tgz)
    //  - macOS detritus (.DS_Store)
    //  - Personal store metadata (store.config.json. example ships, real one doesn't)
    //  - Internal agent skill metadata (skills-lock.json)
    // `store.config.json` SHIPS with the template as a placeholder (with `YOUR_*`
    // tokens). `vexpo rebrand` overwrites it with real values. `eas submit`
    // needs the file to exist; placeholder version means `eas:tf` doesn't error
    // before rebrand has run.
    const SKIP_DIRS = [
      "node_modules",
      ".expo",
      "ios",
      "android",
      ".tanstack",
      ".output",
      ".claude",
      ".agents",
      ".cursor",
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
      /^\.setup-state\.json$/,
      /^\.setup-state\.json\..*\.tmp$/,
      /^\.DS_Store$/,
      /^skills-lock\.json$/,
      /^expo-env\.d\.ts$/,
      /^CODEOWNERS$/,
      /^tsconfig\.tsbuildinfo$/,
      /^bun-error\./,
      /\.tgz$/,
      /\.log$/,
    ];
    await cp(src, dest, {
      recursive: true,
      filter: (path) => {
        if (SKIP_DIRS.some((s) => path.includes(`/${s}/`) || path.endsWith(`/${s}`))) {
          return false;
        }
        const base = path.slice(path.lastIndexOf("/") + 1);
        if (SKIP_BASENAME_PATTERNS.some((re) => re.test(base))) return false;
        return true;
      },
    });
    for (const name of STRIPPED_DOTFILES) {
      try {
        await rename(join(dest, name), join(dest, name.replace(/^\./, "_")));
      } catch {
        // Missing file is fine; means the template didn't ship it.
      }
    }
    const files = await readdir(dest);
    console.log(`[tsup] copied ${files.length} top-level entries from templates/default`);
  },
});
