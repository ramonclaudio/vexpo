/**
 * Read package.json `name` (lowercase, e.g. "vexpo"). Used as the canonical
 * identifier across Convex env, Resend key names, EAS slugs, etc.
 */

import { access, readFile } from "node:fs/promises";

async function readJsonOrNull<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function readTextOrNull(path: string): Promise<string | null> {
  try {
    await access(path);
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function pkgName(): Promise<string> {
  const pkg = await readJsonOrNull<{ name?: string }>("package.json");
  return typeof pkg?.name === "string" && pkg.name ? pkg.name : "app";
}

/**
 * Human-friendly app name. Prefers `app.config.ts`'s `name:` field (which is
 * what users see on the home screen + TestFlight), then falls back to deriving
 * from `package.json` name in title case: "vexpo" → "Vexpo",
 * "my-cool-app" → "My Cool App". Used for `APP_NAME` in Convex env and
 * referenced by emails + the auth flow.
 *
 * Keeping `app.config.ts` as the source of truth means `vexpo doctor` doesn't
 * flag drift when `package.json.name` (npm-package convention, kebab-case)
 * differs from the display name.
 */
export async function appName(): Promise<string> {
  const text = await readTextOrNull("app.config.ts");
  if (text) {
    const match = /\bname:\s*["']([^"']+)["']/.exec(text);
    if (match) return match[1];
  }
  const name = await pkgName();
  const clean = name.replace(/^@[^/]+\//, "");
  const parts = clean.split(/[-_]/).filter(Boolean);
  if (parts.length === 0) return "App";
  return parts.map((w) => (w[0] ?? "").toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Scheme from app.config.ts. Greps the literal. importing the config wants
 * the full Expo runtime, which is overkill here.
 */
export async function scheme(): Promise<string> {
  const text = await readTextOrNull("app.config.ts");
  if (!text) return "app";
  return /scheme:\s*["']([^"']+)["']/.exec(text)?.[1] ?? "app";
}

/**
 * Bundle ID fallback from `BUNDLE_ID = process.env.EXPO_PUBLIC_APP_BUNDLE_ID ?? "..."`.
 * Returns null if it's still the template's `com.example.${pkg.name}` form.
 * Set by setup-rebrand; used by setup-convex as a smart default for the bundle-id prompt.
 */
export async function bundleIdFallback(): Promise<string | null> {
  const text = await readTextOrNull("app.config.ts");
  if (!text) return null;
  return /EXPO_PUBLIC_APP_BUNDLE_ID\s*\?\?\s*"([^"]+)"/.exec(text)?.[1] ?? null;
}

/**
 * Apple Team ID fallback from `APPLE_TEAM_ID = process.env.EXPO_PUBLIC_APPLE_TEAM_ID ?? "..."`.
 * Returns null if it's the template's `ABCDE12345` placeholder.
 */
export async function appleTeamIdFallback(): Promise<string | null> {
  const text = await readTextOrNull("app.config.ts");
  if (!text) return null;
  const value = /EXPO_PUBLIC_APPLE_TEAM_ID\s*\?\?\s*"([^"]+)"/.exec(text)?.[1] ?? null;
  if (!value || value === "ABCDE12345") return null;
  return value;
}
