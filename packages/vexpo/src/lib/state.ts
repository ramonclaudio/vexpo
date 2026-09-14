import { readFile, rename, unlink, writeFile } from "node:fs/promises";

import { fileExists } from "./fs.ts";
import { errText } from "./output.ts";

const STATE_FILE = ".setup-state.json";

export type StepName =
  | "convex"
  | "better-auth"
  | "resend"
  | "review-account"
  | "apple-sign-in"
  | "apple-services-id"
  | "apple-credentials"
  | "apple-asc-link"
  | "asc-key"
  | "eas"
  | "rebrand"
  | "accounts";

type StepRecord = {
  completedAt: string;
  outputs?: Record<string, unknown>;
};

export type SetupState = {
  updatedAt: string;
  steps: Partial<Record<StepName, StepRecord>>;
};

export async function load(): Promise<SetupState> {
  if (!(await fileExists(STATE_FILE))) return { updatedAt: new Date().toISOString(), steps: {} };
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch (err) {
    throw new Error(
      `${STATE_FILE} is not valid JSON: ${errText(err)}. Fix it, or delete it and run setup again.`,
      { cause: err },
    );
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${STATE_FILE} should hold a JSON object. Delete it and run setup again.`);
  }
  const parsed = raw as Partial<SetupState>;
  return {
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    steps: parsed.steps && typeof parsed.steps === "object" ? parsed.steps : {},
  };
}

async function save(state: SetupState): Promise<void> {
  const next: SetupState = { ...state, updatedAt: new Date().toISOString() };
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
  state.steps[name] = { completedAt: now, ...(outputs ? { outputs } : {}) };
  await save(state);
}

export function fingerprint(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}
