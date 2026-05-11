import { access, readFile, writeFile } from "node:fs/promises";

export const ENV_FILE = ".env.local";

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readAll(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!(await fileExists(ENV_FILE))) return out;
  // Strip UTF-8 BOM if present, normalize CRLF → LF.
  const text = (await readFile(ENV_FILE, "utf8")).replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1);
    // Multi-line quoted value: if value starts with `"` or `'` and the closing
    // quote is on a later line, accumulate until we find it. Standard dotenv
    // behavior; preserves the user's intent for keys like SSH keys + JSON
    // blobs that span lines.
    const startQuote = value.match(/^\s*(['"])/);
    if (startQuote) {
      const quote = startQuote[1];
      let rest = value.replace(/^\s*['"]/, "");
      let endIdx = rest.indexOf(quote);
      while (endIdx === -1 && i + 1 < lines.length) {
        i += 1;
        rest += `\n${lines[i]}`;
        endIdx = rest.indexOf(quote);
      }
      value = endIdx === -1 ? rest : rest.slice(0, endIdx);
      out.set(key, value);
      continue;
    }
    // Single-line: trim, drop inline trailing comment (`<space>#...`).
    value = value.trim();
    const hashAt = value.search(/\s#/);
    if (hashAt >= 0) value = value.slice(0, hashAt).trim();
    out.set(key, value);
  }
  return out;
}

export async function readOne(key: string): Promise<string | undefined> {
  return (await readAll()).get(key);
}

export async function ensureLine(key: string, value: string): Promise<void> {
  const current = (await fileExists(ENV_FILE)) ? await readFile(ENV_FILE, "utf8") : "";
  if (new RegExp(`^${key}=`, "m").test(current)) return;
  const needsNewline = current !== "" && !current.endsWith("\n");
  await writeFile(ENV_FILE, `${current}${needsNewline ? "\n" : ""}${key}=${value}\n`);
}

export async function removeLines(keys: readonly string[]): Promise<void> {
  if (!(await fileExists(ENV_FILE))) return;
  const text = await readFile(ENV_FILE, "utf8");
  const drop = new Set(keys);
  const next = text
    .split("\n")
    .filter((l) => {
      const eq = l.indexOf("=");
      if (eq <= 0) return true;
      return !drop.has(l.slice(0, eq).trim());
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  await writeFile(ENV_FILE, next);
}
