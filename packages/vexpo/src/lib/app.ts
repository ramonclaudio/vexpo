import { readFile } from "node:fs/promises";

async function readProjectFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    throw new Error(`no ${path} here. Run vexpo inside the app`);
  }
}

export async function pkgName(): Promise<string> {
  const pkg = JSON.parse(await readProjectFile("package.json")) as { name?: unknown };
  if (typeof pkg.name !== "string" || !pkg.name) {
    throw new Error("package.json has no name. Give it one and run this again");
  }
  return pkg.name;
}

export async function appConfigConst(name: string): Promise<string | undefined> {
  const text = await readProjectFile("app.config.ts");
  return new RegExp(`const ${name} = ["']([^"']+)["'];`).exec(text)?.[1];
}

async function requireConst(name: string): Promise<string> {
  const value = await appConfigConst(name);
  if (!value)
    throw new Error(`app.config.ts has no \`const ${name}\`. Restore it from the template`);
  return value;
}

export const appName = (): Promise<string> => requireConst("APP_NAME");
export const scheme = (): Promise<string> => requireConst("SCHEME");

export async function bundleIdFallback(): Promise<string | null> {
  const text = await readProjectFile("app.config.ts");
  return /EXPO_PUBLIC_APP_BUNDLE_ID\s*\?\?\s*["`]([^"`]+)["`]/.exec(text)?.[1] ?? null;
}

export async function hasWidgets(): Promise<boolean> {
  return /["']expo-widgets["']/.test(await readProjectFile("app.config.ts"));
}

export async function appleTeamIdFallback(): Promise<string | null> {
  const text = await readProjectFile("app.config.ts");
  const value = /EXPO_PUBLIC_APPLE_TEAM_ID\s*\?\?\s*["`]([^"`]+)["`]/.exec(text)?.[1] ?? null;
  return value === "ABCDE12345" ? null : value;
}

type EasBuildProfile = { extends?: string; env?: Record<string, string> };

// The development profiles in eas.json set APP_VARIANT, eas-cli passes a profile's env in when it
// evaluates app.config.ts, and the config appends .dev to the bundle id when the variant is set.
// So a dev profile signs a different identifier than production, widget target and app group too.
export async function isDevProfile(profile: string): Promise<boolean> {
  let build: Record<string, EasBuildProfile>;
  try {
    const eas = JSON.parse(await readProjectFile("eas.json")) as {
      build?: Record<string, EasBuildProfile>;
    };
    build = eas.build ?? {};
  } catch {
    return false;
  }
  const seen = new Set<string>();
  for (
    let name: string | undefined = profile;
    name && !seen.has(name);
    name = build[name]?.extends
  ) {
    seen.add(name);
    const variant = build[name]?.env?.APP_VARIANT;
    if (variant) return variant === "development";
  }
  return false;
}
