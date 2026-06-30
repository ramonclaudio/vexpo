/**
 * Resumable setup state at .setup-state.json. Records which orchestrator
 * steps have completed, with a per-step verifyAt cache to avoid re-querying
 * external services on every run. Secrets are never written here, only IDs
 * and timestamps. Atomic writes via tmp + rename so a Ctrl+C mid-write
 * leaves the previous state intact.
 *
 * The local cache is never the source of truth: external services win on
 * disagreement. Callers re-check freshness with `isStepFresh` before
 * trusting a cached step.
 *
 * Uses node:fs so the module works under both bun and node (vitest runs node).
 */

import { access, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";

import { fileExists } from "./fs.ts";

export const STATE_FILE = ".setup-state.json";
const AUDIT_CAP = 50;
const PID_WARN_WINDOW_MS = 30_000;

export type StepName =
  | "convex"
  | "better-auth"
  | "resend"
  | "review-account"
  | "apple-sign-in"
  | "apple-services-id"
  | "apple-credentials"
  | "apple-asc-link"
  | "apple-eas-rotation-secrets"
  | "asc-key"
  | "eas"
  | "rebrand"
  | "accounts";

export type StepRecord = {
  name: StepName;
  completedAt: string;
  outputs?: Record<string, unknown>;
  verifyAt: string;
};

export type AuditEntry = {
  invokedAt: string;
  args: string[];
  pid: number;
  bunVersion: string;
  cwd: string;
  completed: StepName[];
  skipped: StepName[];
  failed?: { step: StepName; message: string };
};

export type SetupState = {
  createdAt: string;
  updatedAt: string;
  lastPid: number;
  steps: Partial<Record<StepName, StepRecord>>;
  audit: AuditEntry[];
};

const empty = (): SetupState => ({
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastPid: process.pid,
  steps: {},
  audit: [],
});

export async function load(): Promise<SetupState> {
  if (!(await fileExists(STATE_FILE))) return empty();
  // Stat first so we can label "is a directory" / "is a symlink to nowhere"
  // distinctly from "JSON parse failed". A misleading "invalid JSON: EISDIR"
  // sends users hunting for syntax errors in a file that isn't there.
  try {
    const s = await stat(STATE_FILE);
    if (s.isDirectory()) throw new Error(`${STATE_FILE} is a directory, not a file`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("is a directory")) throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch (err) {
    throw new Error(`${STATE_FILE} is invalid JSON: ${err instanceof Error ? err.message : err}`, {
      cause: err,
    });
  }
  if (raw === null || raw === undefined) throw new Error(`${STATE_FILE} is empty or null`);
  if (Array.isArray(raw)) throw new Error(`${STATE_FILE} is an array, expected object`);
  if (typeof raw !== "object") throw new Error(`${STATE_FILE} is not an object`);
  const parsed = raw as Partial<SetupState>;
  const now = new Date().toISOString();
  return {
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : now,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : now,
    lastPid: typeof parsed.lastPid === "number" ? parsed.lastPid : 0,
    steps: parsed.steps && typeof parsed.steps === "object" ? parsed.steps : {},
    audit: Array.isArray(parsed.audit) ? parsed.audit : [],
  };
}

export async function save(state: SetupState): Promise<void> {
  const next: SetupState = {
    ...state,
    updatedAt: new Date().toISOString(),
    lastPid: process.pid,
  };
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2) + "\n");
  await rename(tmp, STATE_FILE);
}

export async function clearAll(): Promise<void> {
  if (!(await fileExists(STATE_FILE))) return;
  await unlink(STATE_FILE);
}

export async function recordStep(name: StepName, outputs?: Record<string, unknown>): Promise<void> {
  const state = await load();
  const now = new Date().toISOString();
  state.steps[name] = {
    name,
    completedAt: now,
    outputs,
    verifyAt: now,
  };
  await save(state);
}

export async function appendAudit(entry: AuditEntry): Promise<void> {
  const state = await load();
  state.audit.push(entry);
  while (state.audit.length > AUDIT_CAP) state.audit.shift();
  await save(state);
}

export function isStepFresh(state: SetupState, name: StepName, ttlHours: number): boolean {
  const rec = state.steps[name];
  if (!rec) return false;
  if (ttlHours === Infinity) return true;
  const ageMs = Date.now() - new Date(rec.verifyAt).getTime();
  return ageMs < ttlHours * 3_600_000;
}

export function checkConcurrentRun(state: SetupState): { active: boolean; otherPid?: number } {
  const updated = new Date(state.updatedAt).getTime();
  const ageMs = Date.now() - updated;
  const hasOtherPid =
    typeof state.lastPid === "number" &&
    Number.isFinite(state.lastPid) &&
    state.lastPid !== 0 &&
    state.lastPid !== process.pid;
  if (ageMs < PID_WARN_WINDOW_MS && hasOtherPid) {
    return { active: true, otherPid: state.lastPid };
  }
  return { active: false };
}

export function fingerprint(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// Read a recorded string output (an ID, not a path) from the first step that
// has it. Unlike lookupCachedPath this skips the filesystem check.
export function lookupOutput(
  state: SetupState,
  steps: readonly StepName[],
  key: string,
): string | undefined {
  for (const step of steps) {
    const value = state.steps[step]?.outputs?.[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

export async function lookupCachedPath(
  state: SetupState,
  steps: readonly StepName[],
  key: string,
): Promise<string | null> {
  for (const step of steps) {
    const rec = state.steps[step];
    if (!rec?.outputs) continue;
    const value = (rec.outputs as Record<string, unknown>)[key];
    if (typeof value !== "string" || !value) continue;
    try {
      await access(value);
      return value;
    } catch {}
  }
  return null;
}
