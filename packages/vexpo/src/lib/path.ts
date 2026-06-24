import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Expand `~` and `~/` to the user's home dir. Other tildes pass through. */
export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return `${homedir()}${p.slice(1)}`;
  return p;
}

/**
 * Canonical local staging dir for one-time Apple `.p8` downloads. Gitignored in
 * the template; the keys' real home is EAS (uploaded, KMS-encrypted), so this is
 * a drop spot, not storage.
 */
export const CREDENTIALS_DIR = "credentials";

/**
 * The single `.p8` staged in `./credentials/`, if exactly one is present. With
 * zero or several (ASC + SIWA both download as `AuthKey_*.p8`, indistinguishable
 * by name) we return undefined and let the caller prompt rather than guess wrong.
 */
export function stagedP8(): string | undefined {
  try {
    const p8s = readdirSync(CREDENTIALS_DIR).filter((f) => f.endsWith(".p8"));
    return p8s.length === 1 ? join(CREDENTIALS_DIR, p8s[0]) : undefined;
  } catch {
    return undefined;
  }
}
