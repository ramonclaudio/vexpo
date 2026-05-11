import { access, readFile } from "node:fs/promises";

import { dlx } from "./pkg-manager.ts";
import { run, spawn } from "./proc.ts";

export async function checkCli(): Promise<{ ok: true; version: string } | { ok: false }> {
  const { code, stdout } = await run([dlx(), "eas", "--version"]);
  if (code !== 0) return { ok: false };
  const detected = stdout
    .trim()
    .replace(/^eas-cli\//, "")
    .split(/\s+/)[0];
  return { ok: true, version: detected };
}

export async function whoami(): Promise<string | null> {
  const { code, stdout } = await run([dlx(), "eas", "whoami"]);
  if (code !== 0) return null;
  const text = stdout.trim();
  return text ? text.split("\n")[0].trim() : null;
}

export async function projectIdFromAppJson(): Promise<string | null> {
  try {
    try {
      await access("app.json");
    } catch {
      return null;
    }
    const json = JSON.parse(await readFile("app.json", "utf8")) as {
      expo?: { extra?: { eas?: { projectId?: string } } };
    };
    // Treat empty string as "not set". `?? null` would let an empty string
    // through, which is never a valid EAS projectId.
    const value = json.expo?.extra?.eas?.projectId;
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function envList(
  environment: "production" | "preview" | "development" = "production",
): Promise<Map<string, string>> {
  const { code, stdout } = await run([
    dlx(),
    "eas",
    "env:list",
    "--environment",
    environment,
    "--format",
    "short",
  ]);
  const out = new Map<string, string>();
  if (code !== 0) return out;
  for (const raw of stdout.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) out.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  return out;
}

export type EasEnvironment = "production" | "preview" | "development";

export type EasEnvType = "string" | "file";

export async function envCreate(
  name: string,
  value: string,
  visibility: "plaintext" | "secret",
  environments: readonly EasEnvironment[] = ["production", "preview", "development"],
  opts?: { type?: EasEnvType },
): Promise<void> {
  const argv = [
    dlx(),
    "eas",
    "env:create",
    "--name",
    name,
    "--value",
    value,
    "--visibility",
    visibility,
  ];
  if (opts?.type) argv.push("--type", opts.type);
  for (const env of environments) argv.push("--environment", env);
  argv.push("--non-interactive");
  const { code, stderr } = await run(argv);
  if (code !== 0) {
    const tail = stderr.trim().split("\n").pop()?.trim() ?? `exit ${code}`;
    throw new Error(`eas env:create ${name} failed: ${tail}`);
  }
}

export async function envUpdate(
  name: string,
  value: string,
  visibility: "plaintext" | "secret",
  environments: readonly EasEnvironment[] = ["production", "preview", "development"],
  opts?: { type?: EasEnvType },
): Promise<void> {
  const argv = [
    dlx(),
    "eas",
    "env:update",
    "--variable-name",
    name,
    "--value",
    value,
    "--visibility",
    visibility,
  ];
  if (opts?.type) argv.push("--type", opts.type);
  for (const env of environments) argv.push("--environment", env);
  argv.push("--non-interactive");
  const { code, stderr } = await run(argv);
  if (code !== 0) {
    const tail = stderr.trim().split("\n").pop()?.trim() ?? `exit ${code}`;
    throw new Error(`eas env:update ${name} failed: ${tail}`);
  }
}

/**
 * Push every var in a `.env`-format file to one or more EAS environments.
 * Wraps `eas env:push` (the official bulk upsert path).
 */
export async function envPush(opts: {
  path: string;
  environments: readonly EasEnvironment[];
  force?: boolean;
}): Promise<void> {
  const argv = [dlx(), "eas", "env:push"];
  for (const env of opts.environments) argv.push("--environment", env);
  argv.push("--path", opts.path);
  if (opts.force) argv.push("--force");
  const { code, stderr } = await run(argv);
  if (code !== 0) {
    const tail = stderr.trim().split("\n").pop()?.trim() ?? `exit ${code}`;
    throw new Error(`eas env:push failed: ${tail}`);
  }
}

/**
 * Wraps `eas init`. If `app.json` already has `extra.eas.projectId`, re-link
 * non-interactively with `--id` so eas-cli skips the "create new project?"
 * prompt entirely. Otherwise create a fresh project.
 */
export async function init(): Promise<{ ok: boolean; projectId?: string }> {
  const existing = await projectIdFromAppJson();
  const argv = existing
    ? [dlx(), "eas", "init", "--non-interactive", "--force", "--id", existing]
    : [dlx(), "eas", "init", "--non-interactive", "--force"];
  const proc = spawn(argv, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0) return { ok: false };
  const id = await projectIdFromAppJson();
  return { ok: !!id, projectId: id ?? undefined };
}

/**
 * Runs `eas update:configure` to wire EAS Update channel fields into eas.json
 * build profiles. Idempotent: re-runs are no-ops once channels are present.
 * Safe to call after init even if updates were already configured.
 *
 * Note: eas-cli currently injects channel names derived from profile names,
 * which produces invalid channels for profile names containing colons (e.g.
 * `development:simulator`). Don't auto-run on a config that has those.
 */
export async function updateConfigure(
  platform: "ios" | "android" | "all" = "ios",
): Promise<boolean> {
  const argv = [dlx(), "eas", "update:configure", "--platform", platform, "--non-interactive"];
  const { code } = await run(argv);
  return code === 0;
}

/**
 * Runs `eas diagnostics`. Returns:
 *   - { ok: true, info } if eas.json validates and CLI auth works
 *   - { ok: false, error } if anything fails
 *
 * eas-cli's diagnostics surfaces eas.json schema errors, missing project
 * link, and CLI version info. Useful as a single health check.
 */
export async function diagnostics(): Promise<
  { ok: true; info: string } | { ok: false; error: string }
> {
  const { code, stdout, stderr } = await run([dlx(), "eas", "diagnostics"]);
  if (code === 0) return { ok: true, info: stdout.trim() };
  const tail = (stderr || stdout).trim().split("\n").slice(0, 4).join("; ");
  return { ok: false, error: tail || `exit ${code}` };
}

/**
 * `eas channel:list --json` returns `{ currentPage: [{ id, name }, ...] }`.
 * Returns the channel names. Empty if the project has none yet.
 */
export async function listChannels(): Promise<string[]> {
  const { code, stdout } = await run([
    dlx(),
    "eas",
    "channel:list",
    "--json",
    "--non-interactive",
    "--limit",
    "25",
  ]);
  if (code !== 0) return [];
  try {
    const parsed = JSON.parse(stdout) as { currentPage?: Array<{ name?: string }> };
    return (parsed.currentPage ?? []).map((c) => c.name ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

/** Create a channel by name. Idempotent: re-creates are no-ops on EAS. */
export async function createChannel(name: string): Promise<boolean> {
  const { code } = await run([dlx(), "eas", "channel:create", name, "--non-interactive", "--json"]);
  return code === 0;
}

/** Ensure every named channel exists. Returns the list of newly-created names. */
export async function ensureChannels(names: readonly string[]): Promise<string[]> {
  const existing = new Set(await listChannels());
  const created: string[] = [];
  for (const name of names) {
    if (existing.has(name)) continue;
    if (await createChannel(name)) created.push(name);
  }
  return created;
}

/** `eas branch:list --json` returns an array of `{ id, name }`. */
export async function listBranches(): Promise<string[]> {
  const { code, stdout } = await run([
    dlx(),
    "eas",
    "branch:list",
    "--json",
    "--non-interactive",
    "--limit",
    "25",
  ]);
  if (code !== 0) return [];
  try {
    const parsed = JSON.parse(stdout) as
      | Array<{ name?: string }>
      | { currentPage?: Array<{ name?: string }> };
    if (Array.isArray(parsed)) return parsed.map((b) => b.name ?? "").filter(Boolean);
    return (parsed.currentPage ?? []).map((b) => b.name ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

/** Create a branch by name. Idempotent. */
export async function createBranch(name: string): Promise<boolean> {
  const { code } = await run([dlx(), "eas", "branch:create", name, "--non-interactive", "--json"]);
  return code === 0;
}

/** Ensure every named branch exists. Returns newly-created names. */
export async function ensureBranches(names: readonly string[]): Promise<string[]> {
  const existing = new Set(await listBranches());
  const created: string[] = [];
  for (const name of names) {
    if (existing.has(name)) continue;
    if (await createBranch(name)) created.push(name);
  }
  return created;
}

/**
 * Runs `eas project:info` to verify the project ID in `app.json` resolves on
 * EAS infrastructure. Returns the canonical `@account/slug` if the project
 * exists. If the project was deleted or the user is logged into a different
 * account, eas-cli errors out and we return null.
 */
export async function projectInfo(): Promise<{ fullName: string; id: string } | null> {
  const { code, stdout } = await run([dlx(), "eas", "project:info"]);
  if (code !== 0) return null;
  const lines = stdout.split("\n").map((l) => l.trim());
  let fullName: string | undefined;
  let id: string | undefined;
  for (const line of lines) {
    const fnMatch = /^fullName\s+(.+)$/.exec(line);
    if (fnMatch) fullName = fnMatch[1].trim();
    const idMatch = /^ID\s+(.+)$/.exec(line);
    if (idMatch) id = idMatch[1].trim();
  }
  if (!fullName || !id) return null;
  return { fullName, id };
}

export async function version(): Promise<string | null> {
  const { code, stdout } = await run([dlx(), "eas", "--version"]);
  if (code !== 0) return null;
  const text = stdout.trim();
  const m = /eas-cli\/([^\s]+)/.exec(text);
  return m?.[1] ?? text;
}
