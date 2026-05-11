import { homedir } from "node:os";

/** Expand `~` and `~/` to the user's home dir. Other tildes pass through. */
export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return `${homedir()}${p.slice(1)}`;
  return p;
}
