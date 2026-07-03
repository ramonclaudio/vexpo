import { access, readFile } from "node:fs/promises";

import { easJson, easRun, easSpawn, easText } from "./eas-cli.ts";

export async function checkCli(): Promise<{ ok: true; version: string } | { ok: false }> {
  const v = await version();
  return v === null ? { ok: false } : { ok: true, version: v };
}

export async function whoami(): Promise<string | null> {
  const { code, stdout } = await easText(["whoami"]);
  if (code !== 0) return null;
  const text = stdout.trim();
  return text ? text.split("\n")[0].trim() : null;
}

export async function resolveProjectId(): Promise<string | null> {
  try {
    await access("app.json");
    const json = JSON.parse(await readFile("app.json", "utf8")) as {
      expo?: { extra?: { eas?: { projectId?: string } } };
    };
    const value = json.expo?.extra?.eas?.projectId;
    if (value && value.length > 0) return value;
  } catch {}

  const fromProcess = process.env.EAS_PROJECT_ID;
  if (fromProcess && fromProcess.length > 0) return fromProcess;

  try {
    const { readOne } = await import("./env-local.ts");
    const fromFile = await readOne("EAS_PROJECT_ID");
    if (fromFile && fromFile.length > 0) {
      // Export to `process.env` so subprocess invocations of `eas-cli`
      // (e.g. `eas project:info`, `eas env:list`) inherit the value when
      // they evaluate the project's `app.config.ts`. Without this, the
      // resolution chain only helps vexpo's own state — subprocesses spawn
      // with the parent shell's env and miss the `.env.local` source.
      process.env.EAS_PROJECT_ID = fromFile;
      return fromFile;
    }
  } catch {}

  return null;
}

/**
 * Returns null on a non-zero `eas env:list` (not logged in, transient GraphQL
 * failure, unreachable) so callers can tell "failed to read" from "genuinely
 * empty". Treating a failure as an empty map makes every remote var look absent,
 * which turns an env push into a blind overwrite. Mirrors convex-env's envMap.
 */
export async function envList(
  environment: "production" | "preview" | "development" = "production",
): Promise<Map<string, string> | null> {
  const { code, stdout } = await easText([
    "env:list",
    "--environment",
    environment,
    "--format",
    "short",
  ]);
  if (code !== 0) return null;
  const out = new Map<string, string>();
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
  // eas-cli takes the value only via --value argv; its only file channel is
  // `--type file`, which stores a different (FileBase64) variable type, not a
  // plaintext string. No stdin, so a string secret can't stay off the process
  // table here the way convex-env.envSet keeps it.
  await easRun([
    "env:create",
    "--name",
    name,
    "--value",
    value,
    "--visibility",
    visibility,
    ...(opts?.type ? ["--type", opts.type] : []),
    ...environments.flatMap((env) => ["--environment", env]),
    "--non-interactive",
  ]);
}

export async function envUpdate(
  name: string,
  value: string,
  visibility: "plaintext" | "secret",
  environments: readonly EasEnvironment[] = ["production", "preview", "development"],
  opts?: { type?: EasEnvType },
): Promise<void> {
  // `env:update` identifies the existing variable by name + its CURRENT
  // environment (--variable-environment). Without it, a name that exists in
  // several environments is ambiguous and eas-cli prompts "Select variable",
  // which a --non-interactive run can't answer. We deliberately do NOT pass
  // --environment (the "new environments"): omitting it leaves the var's
  // existing env links unchanged, we only want to change the value.
  await easRun([
    "env:update",
    "--variable-name",
    name,
    "--value",
    value,
    "--visibility",
    visibility,
    ...(opts?.type ? ["--type", opts.type] : []),
    ...environments.flatMap((env) => ["--variable-environment", env]),
    "--non-interactive",
  ]);
}

export async function envPush(opts: {
  path: string;
  environments: readonly EasEnvironment[];
  force?: boolean;
}): Promise<void> {
  // eas-cli rejects multiple --environment flags in one `env:push` (fails with
  // "GraphQL request failed"), so push to each environment in its own call.
  for (const env of opts.environments) {
    await easRun([
      "env:push",
      "--environment",
      env,
      "--path",
      opts.path,
      ...(opts.force ? ["--force"] : []),
    ]);
  }
}

export async function init(): Promise<{ ok: boolean; projectId?: string }> {
  const existing = await resolveProjectId();
  const args = existing
    ? ["init", "--non-interactive", "--force", "--id", existing]
    : ["init", "--non-interactive", "--force"];
  if ((await easSpawn(args)) !== 0) return { ok: false };
  const id = await resolveProjectId();
  return { ok: !!id, projectId: id ?? undefined };
}

async function listChannels(): Promise<string[]> {
  // easJson throws on a garbled zero-exit response instead of reading it as "no
  // channels" — that footgun would make ensureChannels re-create existing names.
  const parsed = await easJson<{ currentPage?: Array<{ name?: string }> }>([
    "channel:list",
    "--limit",
    "25",
  ]);
  return (parsed.currentPage ?? []).map((c) => c.name ?? "").filter(Boolean);
}

async function createChannel(name: string): Promise<boolean> {
  const { code } = await easText(["channel:create", name, "--non-interactive", "--json"]);
  return code === 0;
}

// Idempotency is ours, not EAS's: list first, create only the missing names, and
// throw on a real create failure so the caller can't read it as "already exists".
export async function ensureChannels(names: readonly string[]): Promise<string[]> {
  const existing = new Set(await listChannels());
  const created: string[] = [];
  for (const name of names) {
    if (existing.has(name)) continue;
    if (!(await createChannel(name))) throw new Error(`eas channel:create ${name} failed`);
    created.push(name);
  }
  return created;
}

async function listBranches(): Promise<string[]> {
  const parsed = await easJson<
    Array<{ name?: string }> | { currentPage?: Array<{ name?: string }> }
  >(["branch:list", "--limit", "25"]);
  if (Array.isArray(parsed)) return parsed.map((b) => b.name ?? "").filter(Boolean);
  return (parsed.currentPage ?? []).map((b) => b.name ?? "").filter(Boolean);
}

async function createBranch(name: string): Promise<boolean> {
  const { code } = await easText(["branch:create", name, "--non-interactive", "--json"]);
  return code === 0;
}

export async function ensureBranches(names: readonly string[]): Promise<string[]> {
  const existing = new Set(await listBranches());
  const created: string[] = [];
  for (const name of names) {
    if (existing.has(name)) continue;
    if (!(await createBranch(name))) throw new Error(`eas branch:create ${name} failed`);
    created.push(name);
  }
  return created;
}

export async function projectInfo(): Promise<{ fullName: string; id: string } | null> {
  const { code, stdout } = await easText(["project:info"]);
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
  const { code, stdout } = await easText(["--version"]);
  if (code !== 0) return null;
  const text = stdout.trim();
  const m = /eas-cli\/([^\s]+)/.exec(text);
  return m?.[1] ?? text;
}
