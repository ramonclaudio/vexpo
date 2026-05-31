import { describe, expect, it, vi } from "vitest";

import { AscApiError } from "../../src/lib/asc-api.ts";

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));

vi.mock("../../src/lib/asc-state.ts", () => ({
  ascBootstrap: vi.fn().mockResolvedValue({ client: {} }),
}));
vi.mock("../../src/lib/asc-sandbox.ts", () => ({
  sandbox: () => ({ sandboxTesters: { list: listMock } }),
}));

import { runSandboxList } from "../../src/commands/sandbox.ts";

// Apple 404s the whole sandboxTesters surface when it isn't enabled for the team.
const asc404 = () =>
  new AscApiError(
    404,
    JSON.stringify({
      errors: [
        {
          status: "404",
          code: "PATH_ERROR",
          detail: "The resource 'v1/sandboxTesters' does not exist",
        },
      ],
    }),
  );

describe("runSandboxList", () => {
  it("degrades gracefully on Apple's 404: exit 0, a plain note, not the raw ASC error", async () => {
    listMock.mockRejectedValueOnce(asc404());
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const code = await runSandboxList();
    const out = err.mock.calls.map((c) => String(c[0])).join("");
    err.mockRestore();

    expect(code).toBe(0); // not a vexpo failure
    expect(out).toContain("unavailable");
    expect(out).toContain("App Store Connect"); // the human-readable pointer
    expect(out).not.toContain("PATH_ERROR"); // the raw ASC error is swallowed
  });

  it("still hard-fails (exit 1) on a non-404 error", async () => {
    listMock.mockRejectedValueOnce(new Error("network boom"));
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const code = await runSandboxList();
    err.mockRestore();
    expect(code).toBe(1);
  });
});
