import { readFile } from "node:fs/promises";

import { easJson, easRun, easSpawn, easText } from "./eas-cli.ts";
import { parseKeyValueLines } from "./env-files.ts";
import { readOne } from "./env-local.ts";
import { fileExists } from "./fs.ts";

export type EasEnvironment = "production" | "development";

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
  if (!(await fileExists("app.json"))) return null;
  const json = JSON.parse(await readFile("app.json", "utf8")) as {
    expo?: { extra?: { eas?: { projectId?: string } } };
  };
  return nonEmpty(json.expo?.extra?.eas?.projectId);
}

async function projectIdFromEnvFile(): Promise<string | null> {
  const value = nonEmpty(await readOne("EAS_PROJECT_ID"));
  if (value) process.env.EAS_PROJECT_ID = value;
  return value;
}

export async function resolveProjectId(): Promise<string | null> {
  return (
    (await projectIdFromAppJson()) ??
    nonEmpty(process.env.EAS_PROJECT_ID) ??
    (await projectIdFromEnvFile())
  );
}

export async function envList(environment: EasEnvironment): Promise<Map<string, string> | null> {
  const { code, stdout } = await easText([
    "env:list",
    "--environment",
    environment,
    "--format",
    "short",
  ]);
  if (code !== 0) return null;
  return parseKeyValueLines(stdout);
}

export async function envPush(opts: {
  path: string;
  environment: EasEnvironment;
  force?: boolean;
}): Promise<void> {
  await easRun([
    "env:push",
    "--environment",
    opts.environment,
    "--path",
    opts.path,
    ...(opts.force ? ["--force"] : []),
  ]);
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
  const parsed = await easJson<
    Array<{ name?: string }> | { currentPage?: Array<{ name?: string }> }
  >(["channel:list", "--limit", "25"]);
  const rows = Array.isArray(parsed) ? parsed : (parsed.currentPage ?? []);
  return rows.map((r) => r.name ?? "").filter(Boolean);
}

// channel:create also creates the branch of the same name, so branches need no step.
export async function ensureChannels(names: readonly string[]): Promise<string[]> {
  const existing = new Set(await listChannels());
  const created: string[] = [];
  for (const name of names) {
    if (existing.has(name)) continue;
    const { code } = await easText(["channel:create", name, "--non-interactive", "--json"]);
    if (code !== 0) throw new Error(`eas channel:create ${name} failed`);
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
