import { describe, expect, it, vi } from "vitest";

import { AscApiError } from "../../src/lib/asc-api.ts";

const { listMock, updateMock, clearMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  updateMock: vi.fn(),
  clearMock: vi.fn(),
}));

vi.mock("../../src/lib/asc-state.ts", () => ({
  ascBootstrap: vi.fn().mockResolvedValue({ client: {} }),
}));
vi.mock("../../src/lib/asc-sandbox.ts", () => ({
  sandbox: () => ({
    sandboxTesters: { list: listMock, update: updateMock, clearPurchaseHistory: clearMock },
  }),
}));

import {
  runSandboxClearPurchases,
  runSandboxList,
  runSandboxUpdate,
} from "../../src/commands/sandbox.ts";

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

describe("runSandboxUpdate", () => {
  it("degrades gracefully on Apple's 404: exit 1, a plain note, not the raw ASC error", async () => {
    updateMock.mockRejectedValueOnce(asc404());
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const code = await runSandboxUpdate("TESTER_ID", { interruptPurchases: true });
    const out = err.mock.calls.map((c) => String(c[0])).join("");
    err.mockRestore();

    expect(code).toBe(1);
    expect(out).toContain("unavailable");
    expect(out).toContain("App Store Connect");
    expect(out).not.toContain("PATH_ERROR");
  });

  it("hard-fails on a non-404 error, no unavailable note", async () => {
    updateMock.mockRejectedValueOnce(new Error("network boom"));
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const code = await runSandboxUpdate("TESTER_ID", { interruptPurchases: true });
    const out = err.mock.calls.map((c) => String(c[0])).join("");
    err.mockRestore();

    expect(code).toBe(1);
    expect(out).not.toContain("App Store Connect");
  });
});

describe("runSandboxClearPurchases", () => {
  it("degrades gracefully on Apple's 404: exit 1, a plain note, not the raw ASC error", async () => {
    clearMock.mockRejectedValueOnce(asc404());
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const code = await runSandboxClearPurchases(["TESTER_ID"]);
    const out = err.mock.calls.map((c) => String(c[0])).join("");
    err.mockRestore();

    expect(code).toBe(1);
    expect(out).toContain("unavailable");
    expect(out).toContain("App Store Connect");
    expect(out).not.toContain("PATH_ERROR");
  });

  it("hard-fails on a non-404 error, no unavailable note", async () => {
    clearMock.mockRejectedValueOnce(new Error("network boom"));
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const code = await runSandboxClearPurchases(["TESTER_ID"]);
    const out = err.mock.calls.map((c) => String(c[0])).join("");
    err.mockRestore();

    expect(code).toBe(1);
    expect(out).not.toContain("App Store Connect");
  });
});
