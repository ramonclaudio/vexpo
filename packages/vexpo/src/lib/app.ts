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

export async function scheme(): Promise<string> {
  const text = await readTextOrNull("app.config.ts");
  if (!text) return "app";
  return /scheme:\s*["']([^"']+)["']/.exec(text)?.[1] ?? "app";
}

export async function bundleIdFallback(): Promise<string | null> {
  const text = await readTextOrNull("app.config.ts");
  if (!text) return null;
  return /EXPO_PUBLIC_APP_BUNDLE_ID\s*\?\?\s*"([^"]+)"/.exec(text)?.[1] ?? null;
}

export async function appleTeamIdFallback(): Promise<string | null> {
  const text = await readTextOrNull("app.config.ts");
  if (!text) return null;
  const value = /EXPO_PUBLIC_APPLE_TEAM_ID\s*\?\?\s*"([^"]+)"/.exec(text)?.[1] ?? null;
  if (!value || value === "ABCDE12345") return null;
  return value;
}
