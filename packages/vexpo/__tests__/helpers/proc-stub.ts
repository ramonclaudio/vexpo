import { vi } from "vitest";

/** A stand-in subprocess for a spawn that only ever gets awaited. */
export const exitedWith = (code: number) => ({
  exited: Promise.resolve(code),
  stdout: null,
  stderr: null,
  stdin: null,
  pid: 1,
  kill: () => {},
});

/**
 * The whole `lib/proc.ts` surface, for `vi.mock`. Factories run before imports
 * resolve, so reach it with an async factory:
 *
 *   vi.mock("../../src/lib/proc.ts", async () =>
 *     (await import("../helpers/proc-stub.ts")).procStub());
 */
export const procStub = (code = 0, stdout = "") => ({
  run: vi.fn().mockResolvedValue({ code, stdout, stderr: "" }),
  spawn: vi.fn(() => exitedWith(code)),
});
