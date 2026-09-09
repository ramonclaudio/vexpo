import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const SCRIPT = fileURLToPath(new URL("../../scripts/clean.mjs", import.meta.url));
const ESC = String.fromCharCode(27);

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

describe("clean.mjs color", () => {
  it("writes no escapes off a terminal", async () => {
    expect(await stderrOf()).not.toContain(ESC);
  });

  it("writes no escapes under NO_COLOR", async () => {
    expect(await stderrOf({ NO_COLOR: "1" })).not.toContain(ESC);
  });

  it("writes no escapes under TERM=dumb", async () => {
    expect(await stderrOf({ TERM: "dumb" })).not.toContain(ESC);
  });

  it("keeps the text marker on the error", async () => {
    expect(await stderrOf()).toContain("xx   Unknown option");
  });
});
