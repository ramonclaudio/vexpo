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

export async function appleTeamIdFallback(): Promise<string | null> {
  const text = await readProjectFile("app.config.ts");
  const value = /EXPO_PUBLIC_APPLE_TEAM_ID\s*\?\?\s*["`]([^"`]+)["`]/.exec(text)?.[1] ?? null;
  return value === "ABCDE12345" ? null : value;
}
