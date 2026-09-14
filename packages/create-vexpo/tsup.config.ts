import { cp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { defineConfig } from "tsup";

// `vexpo asc connect` and `vexpo submit` write the App Store Connect app id and key into the
// eas.json submit profiles, which is right for someone's own fork and wrong for the copy that
// ships. Whoever last ran those in this checkout would otherwise hand their ids to every new
// project, so the packaged eas.json keeps the build profiles and forgets who built it.
const SUBMIT_IDENTITY = ["ascAppId", "ascApiKeyPath", "ascApiKeyId", "ascApiKeyIssuerId"];

// `eas init` writes the project id into app.json, which is right for someone's own fork and
// wrong for the copy that ships. A new project links itself on the first `vexpo eas`.
async function stripProjectId(path: string): Promise<void> {
  const cfg = JSON.parse(await readFile(path, "utf8")) as {
    expo?: { extra?: { eas?: { projectId?: string } } };
  };
  if (!cfg.expo?.extra?.eas?.projectId) return;
  delete cfg.expo.extra.eas.projectId;
  if (Object.keys(cfg.expo.extra.eas).length === 0) delete cfg.expo.extra.eas;
  if (Object.keys(cfg.expo.extra).length === 0) delete cfg.expo.extra;
  await writeFile(path, JSON.stringify(cfg, null, 2) + "\n");
  console.log("[tsup] stripped the EAS project id from app.json");
}

async function stripSubmitIdentity(path: string): Promise<void> {
  const cfg = JSON.parse(await readFile(path, "utf8")) as {
    submit?: Record<string, { ios?: Record<string, unknown> }>;
  };
  let stripped = 0;
  for (const profile of Object.values(cfg.submit ?? {})) {
    for (const key of SUBMIT_IDENTITY) {
      if (profile.ios && key in profile.ios) {
        delete profile.ios[key];
        stripped++;
      }
    }
  }
  if (stripped === 0) return;
  await writeFile(path, JSON.stringify(cfg, null, 2) + "\n");
  console.log(`[tsup] stripped ${stripped} submit identity field(s) from eas.json`);
}

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
      // every store.config.* but the example, which the copy below becomes store.config.json
      /^store\.config\.(?!example\.json$)/,
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
    await stripSubmitIdentity(join(dest, "eas.json"));
    await stripProjectId(join(dest, "app.json"));
    const files = await readdir(dest);
    console.log(`[tsup] copied ${files.length} top-level entries from templates/default`);
  },
});
