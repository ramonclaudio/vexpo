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

function nonEmpty(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

async function projectIdFromAppJson(): Promise<string | null> {
  try {
    await access("app.json");
    const json = JSON.parse(await readFile("app.json", "utf8")) as {
      expo?: { extra?: { eas?: { projectId?: string } } };
    };
    return nonEmpty(json.expo?.extra?.eas?.projectId);
  } catch {
    return null;
  }
}

async function projectIdFromEnvFile(): Promise<string | null> {
  try {
    const { readOne } = await import("./env-local.ts");
    const value = nonEmpty(await readOne("EAS_PROJECT_ID"));
    if (value) process.env.EAS_PROJECT_ID = value;
    return value;
  } catch {
    return null;
  }
}

export async function resolveProjectId(): Promise<string | null> {
  return (
    (await projectIdFromAppJson()) ??
    nonEmpty(process.env.EAS_PROJECT_ID) ??
    (await projectIdFromEnvFile())
  );
}

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
