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
    //  - working notes the template author keeps locally (plans, docs, .dev, .vexpo-manual-setup, .rebrand-backup)
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
    // CNG/build outputs are anchored to the template ROOT. A local expo module
    // ships its own ios/ sources under modules/*/ios, and an unanchored "ios"
    // match would gut them from the published tarball: same bug class as the
    // /ios/ anchor in the template .gitignore.
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
      // No lockfile ships, npm's included. The committed `package-lock.json`
      // freezes `@ramonclaudio/vexpo` at whatever version was published when
      // the lock was last written — one release behind by definition at
      // publish time — and `npm install` honors an in-range lock pin, so a
      // fresh scaffold would install the previous CLI. Let install resolve
      // `^0.1.x` fresh; the scaffolder's git commit captures the new lock.
      /^package-lock\.json$/,
      /^bun\.lock$/,
      /^bun\.lockb$/,
      /^pnpm-lock\.yaml$/,
      /^yarn\.lock$/,
      // Editor / vexpo-author backup files. We've seen `*.yml.bak` accumulate
      // in `templates/default/.eas/workflows/` after migrations; never ship.
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
    for (const name of STRIPPED_DOTFILES) {
      try {
        await rename(join(dest, name), join(dest, strippedToUnderscore(name)));
      } catch {
        // Missing file is fine; means the template didn't ship it.
      }
    }
    const files = await readdir(dest);
    console.log(`[tsup] copied ${files.length} top-level entries from templates/default`);
  },
});
