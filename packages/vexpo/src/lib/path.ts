import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return `${homedir()}${p.slice(1)}`;
  return p;
}

export const CREDENTIALS_DIR = "credentials";

export function stagedP8(): string | undefined {
  try {
    const p8s = readdirSync(CREDENTIALS_DIR).filter((f) => f.endsWith(".p8"));
    return p8s.length === 1 ? join(CREDENTIALS_DIR, p8s[0]) : undefined;
  } catch {
    return undefined;
  }
}
