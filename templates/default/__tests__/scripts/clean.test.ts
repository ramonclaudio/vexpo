import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const SCRIPT = fileURLToPath(new URL("../../scripts/clean.mjs", import.meta.url));
const ESC = String.fromCharCode(27);

// A test's stderr is a pipe, never a terminal, which is the case that matters:
// a run redirected to a log file is what a screen reader reads back.
async function stderrOf(env: Record<string, string> = {}): Promise<string> {
  try {
    const { stderr } = await run(process.execPath, [SCRIPT, "--not-an-option"], {
      env: { ...process.env, ...env },
    });
    return stderr;
  } catch (err) {
    return String((err as { stderr?: string }).stderr ?? "");
  }
}

describe("clean.mjs colour", () => {
  it("writes no escapes off a terminal", async () => {
    expect(await stderrOf()).not.toContain(ESC);
  });

  it("writes no escapes under NO_COLOR", async () => {
    expect(await stderrOf({ NO_COLOR: "1" })).not.toContain(ESC);
  });

  it("writes no escapes under TERM=dumb", async () => {
    expect(await stderrOf({ TERM: "dumb" })).not.toContain(ESC);
  });

  // Nothing may rest on colour: the severity tag has to survive without it.
  it("keeps the text marker on the error", async () => {
    expect(await stderrOf()).toContain("xx   Unknown option");
  });
});
