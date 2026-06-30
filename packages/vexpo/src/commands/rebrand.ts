import { access, mkdir, readFile, writeFile } from "node:fs/promises";

import {
  BOLD,
  DIM,
  RESET,
  ask,
  askYesNo,
  bad,
  fail,
  line,
  nop,
  note,
  ok,
  section,
  yep,
} from "../lib/output.ts";
import { envSet as convexEnvSet } from "../lib/convex-env.ts";
import { ensureLine, readAll, removeLines } from "../lib/env-local.ts";
import { load, recordStep } from "../lib/state.ts";

export type RebrandOptions = {
  force?: boolean;
  yes?: boolean;
  appName?: string;
  bundleId?: string;
  packageName?: string;
  scheme?: string;
  ownerName?: string;
  expoOwner?: string;
  reviewEmail?: string;
  reviewPhone?: string;
  marketingUrl?: string;
  supportUrl?: string;
  privacyUrl?: string;
  copyright?: string;
};

type RebrandInputs = {
  appName: string;
  packageName: string;
  bundleId: string;
  scheme: string;
  ownerName: string;
  reviewFirstName: string;
  reviewLastName: string;
  reviewEmail: string;
  reviewPhone: string;
  marketingUrl: string;
  supportUrl: string;
  privacyUrl: string;
  copyrightOwner: string;
  expoOwner?: string;
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function bundleSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
}

async function promptInputs(overrides: Partial<RebrandInputs>): Promise<RebrandInputs> {
  // Every prompt resolves from an override first. A TTY is only needed when a
  // value is actually missing, so a fully-flagged run works without one.
  const interactive = process.stdin.isTTY === true;
  if (interactive) {
    line();
    note(
      `${DIM}4 prompts. Everything else is derived. Override any with flags or edit later.${RESET}`,
    );
    line();
  }

  const appName =
    overrides.appName ??
    (interactive
      ? (await ask(`  ${BOLD}App name${RESET} ${DIM}(e.g. Foobar)${RESET} > `)).trim()
      : "");
  if (!appName) fail("app name required");

  const defaultPkg = slug(appName);
  const bundleHint = `com.${slug(appName).replace(/-/g, "")}.${bundleSlug(defaultPkg)}`;
  const bundleId =
    overrides.bundleId ??
    (interactive
      ? (await ask(`  ${BOLD}Bundle ID${RESET} ${DIM}[${bundleHint}]${RESET} > `)).trim() ||
        bundleHint
      : bundleHint);

  const ownerName =
    overrides.ownerName ??
    (interactive ? (await ask(`  ${BOLD}Your name${RESET} > `)).trim() || "Owner" : "Owner");

  const reviewEmail =
    overrides.reviewEmail ??
    (interactive ? (await ask(`  ${BOLD}Apple review contact email${RESET} > `)).trim() : "");
  if (!reviewEmail) fail("review email required");

  const packageName = overrides.packageName ?? defaultPkg;
  const scheme = overrides.scheme ?? bundleSlug(packageName);
  const githubHint = `https://github.com/${slug(ownerName)}/${packageName}`;
  const marketingUrl = overrides.marketingUrl ?? githubHint;
  const supportUrl = overrides.supportUrl ?? `${githubHint}/issues`;
  const privacyUrl = overrides.privacyUrl ?? `${githubHint}#privacy`;
  const reviewPhone = overrides.reviewPhone ?? "";
  const [firstFromOwner = "First", ...restOwner] = ownerName.split(/\s+/);
  const reviewFirstName = overrides.reviewFirstName ?? firstFromOwner;
  const reviewLastName = overrides.reviewLastName ?? (restOwner.join(" ") || "Last");
  const copyrightOwner = overrides.copyrightOwner ?? `${new Date().getFullYear()} ${ownerName}`;
  const expoOwner = overrides.expoOwner;

  return {
    appName,
    packageName,
    bundleId,
    scheme,
    ownerName,
    reviewFirstName,
    reviewLastName,
    reviewEmail,
    reviewPhone,
    marketingUrl,
    supportUrl,
    privacyUrl,
    copyrightOwner,
    expoOwner,
  };
}

/**
 * The bundle id only lands in app.config.ts as a `??` fallback. If a prior
 * `vexpo lite` already wrote EXPO_PUBLIC_APP_BUNDLE_ID to .env.local, that value
 * shadows the new default forever. So when the new id differs, overwrite the env
 * line (ensureLine alone is a no-op on an existing key) and push it to Convex if
 * a deployment is already wired up. Without one, the next `vexpo convex` carries it
 * (env push routes EXPO_PUBLIC_APP_BUNDLE_ID to EAS only, not Convex).
 */
async function syncBundleId(bundleId: string): Promise<void> {
  const env = await readAll();
  const current = env.get("EXPO_PUBLIC_APP_BUNDLE_ID");
  if (current === bundleId) return;

  if (current !== undefined) await removeLines(["EXPO_PUBLIC_APP_BUNDLE_ID"]);
  await ensureLine("EXPO_PUBLIC_APP_BUNDLE_ID", bundleId);
  ok(`wrote EXPO_PUBLIC_APP_BUNDLE_ID=${bundleId} to .env.local`);

  if (env.has("CONVEX_DEPLOYMENT")) {
    await convexEnvSet("APP_BUNDLE_ID", bundleId);
    ok(`Convex env: APP_BUNDLE_ID=${bundleId}`);
  } else {
    note("no Convex deployment yet; the next `vexpo convex` run carries APP_BUNDLE_ID");
  }
}

async function backup(files: string[], stamp: string): Promise<void> {
  const dir = `.rebrand-backup/${stamp}`;
  await mkdir(dir, { recursive: true });
  for (const f of files) {
    try {
      await access(f);
    } catch {
      continue;
    }
    await writeFile(`${dir}/${f.replace(/\//g, "_")}`, await readFile(f, "utf8"));
  }
  ok(`backups → ${dir}`);
}

async function rewriteAppConfig(inputs: RebrandInputs): Promise<void> {
  const file = "app.config.ts";
  let text = await readFile(file, "utf8");

  text = text.replace(
    /const BUNDLE_ID = process\.env\.EXPO_PUBLIC_APP_BUNDLE_ID \?\? `com\.example\.\$\{pkg\.name\}`;/,
    `const BUNDLE_ID = process.env.EXPO_PUBLIC_APP_BUNDLE_ID ?? "${inputs.bundleId}";`,
  );

  text = text.replace(
    /name: IS_DEV \? "[^"]+" : "[^"]+",/,
    `name: IS_DEV ? "${inputs.appName} (Dev)" : "${inputs.appName}",`,
  );

  text = text.replace(/slug: "[^"]+",/, `slug: "${inputs.packageName}",`);

  text = text.replace(/scheme: "[^"]+",/, `scheme: "${inputs.scheme}",`);

  await writeFile(file, text);
  ok(`updated ${file}`);
}

async function rewriteAppJson(): Promise<void> {
  const file = "app.json";
  const json = JSON.parse(await readFile(file, "utf8")) as {
    expo?: { extra?: { eas?: { projectId?: string } } };
  };
  if (json.expo?.extra?.eas) delete json.expo.extra.eas.projectId;
  await writeFile(file, JSON.stringify(json, null, 2) + "\n");
  ok(`reset ${file} (eas init will regenerate projectId)`);
}

async function rewritePackageJson(inputs: RebrandInputs): Promise<void> {
  const file = "package.json";
  const json = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  json.name = inputs.packageName;
  json.version = "0.1.0";
  await writeFile(file, JSON.stringify(json, null, 2) + "\n");
  ok(`updated ${file} (name=${inputs.packageName}, version=0.1.0)`);
}

async function rewriteStoreConfig(inputs: RebrandInputs): Promise<void> {
  const file = "store.config.json";
  let json: StoreConfigShape;
  try {
    await access(file);
    json = JSON.parse(await readFile(file, "utf8")) as StoreConfigShape;
  } catch {
    throw new Error(`${file} missing or unparseable; restore it from the vexpo template first`);
  }
  const en = json.apple.info["en-US"];
  en.title = `${inputs.appName} | Convex on Expo`;
  en.marketingUrl = inputs.marketingUrl;
  en.supportUrl = inputs.supportUrl;
  en.privacyPolicyUrl = inputs.privacyUrl;
  json.apple.copyright = inputs.copyrightOwner;
  json.apple.review.firstName = inputs.reviewFirstName;
  json.apple.review.lastName = inputs.reviewLastName;
  json.apple.review.email = inputs.reviewEmail;
  json.apple.review.phone = inputs.reviewPhone;
  await writeFile(file, JSON.stringify(json, null, 2) + "\n");
  ok(`updated ${file}`);
}

type StoreConfigShape = {
  configVersion: number;
  apple: {
    copyright: string;
    categories: string[];
    info: { "en-US": Record<string, unknown> };
    advisory: Record<string, unknown>;
    review: Record<string, unknown>;
    release: Record<string, unknown>;
    releaseNotes: Record<string, string>;
    promotionalText: Record<string, string>;
  };
};

async function alreadyRebranded(): Promise<boolean> {
  const state = await load();
  return !!state.steps.rebrand;
}

async function detectTemplateDefaults(): Promise<{ stillTemplate: boolean; signals: string[] }> {
  const signals: string[] = [];
  const cfg = await readFile("app.config.ts", "utf8");
  if (cfg.includes("`com.example.${pkg.name}`")) signals.push("app.config.ts: example bundle id");
  if (/slug: "vexpo"/.test(cfg)) signals.push("app.config.ts: slug=vexpo");
  if (/scheme: "vexpo"/.test(cfg)) signals.push("app.config.ts: scheme=vexpo");
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as { name?: string };
  if (pkg.name === "vexpo") signals.push("package.json: name=vexpo");
  return { stillTemplate: signals.length > 0, signals };
}

export async function runRebrand(options: RebrandOptions): Promise<number> {
  try {
    const overrides: Partial<RebrandInputs> = {
      appName: options.appName,
      bundleId: options.bundleId,
      packageName: options.packageName,
      scheme: options.scheme,
      ownerName: options.ownerName,
      expoOwner: options.expoOwner,
      reviewEmail: options.reviewEmail,
      reviewPhone: options.reviewPhone,
      marketingUrl: options.marketingUrl,
      supportUrl: options.supportUrl,
      privacyUrl: options.privacyUrl,
      copyrightOwner: options.copyright,
    };

    section("Rebrand");

    if (!options.force && (await alreadyRebranded())) {
      nop("rebrand already complete (state.json); pass --force to re-run");
      return 0;
    }

    const detect = await detectTemplateDefaults();
    if (!detect.stillTemplate && !options.force) {
      ok("project already differs from vexpo template defaults; nothing to rebrand");
      note("--force to re-run anyway");
      return 0;
    }
    if (detect.signals.length > 0) {
      note("template defaults still in place:");
      for (const s of detect.signals) note(`  • ${s}`);
      line();
    }

    if (!process.stdin.isTTY) {
      if (
        !overrides.appName ||
        !overrides.bundleId ||
        !overrides.ownerName ||
        !overrides.reviewEmail
      ) {
        bad(
          "non-TTY rebrand needs --app-name, --bundle-id, --owner-name, --review-email at minimum",
        );
        return 1;
      }
    }

    const inputs = await promptInputs(overrides);
    line();
    note(`${BOLD}About to rewrite:${RESET}`);
    note(
      `  app name      ${BOLD}${inputs.appName}${RESET} ${DIM}/ slug ${inputs.packageName} / scheme ${inputs.scheme}${RESET}`,
    );
    note(`  bundle id     ${BOLD}${inputs.bundleId}${RESET}`);
    note(`  marketing     ${inputs.marketingUrl}`);
    note(`  support       ${inputs.supportUrl}`);
    note(`  privacy       ${inputs.privacyUrl}`);
    note(
      `  review        ${inputs.reviewFirstName} ${inputs.reviewLastName} <${inputs.reviewEmail}>`,
    );
    if (!options.yes && !(await askYesNo("Apply these changes?", true))) {
      nop("aborted, no files changed");
      return 0;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await backup(["app.config.ts", "app.json", "package.json", "store.config.json"], stamp);

    await rewriteAppConfig(inputs);
    await rewriteAppJson();
    await rewritePackageJson(inputs);
    await rewriteStoreConfig(inputs);
    await syncBundleId(inputs.bundleId);

    // app.config.ts reads `owner` from EXPO_PUBLIC_EXPO_OWNER; persist the slug
    // so team/org accounts actually get it (env-files.ts routes it to EAS too).
    if (inputs.expoOwner) {
      await ensureLine("EXPO_PUBLIC_EXPO_OWNER", inputs.expoOwner);
      ok(`wrote EXPO_PUBLIC_EXPO_OWNER=${inputs.expoOwner} to .env.local`);
    }

    await recordStep("rebrand", {
      appName: inputs.appName,
      packageName: inputs.packageName,
      bundleId: inputs.bundleId,
      scheme: inputs.scheme,
      rebrandedAt: new Date().toISOString(),
      backupDir: `.rebrand-backup/${stamp}`,
    });

    line();
    ok("rebrand complete");
    yep("re-run `vexpo full` to regenerate EAS projectId + reprovision Convex env");
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
