import { vi } from "vitest";

export const exitedWith = (code: number) => ({
  exited: Promise.resolve(code),
  stdout: null,
  stderr: null,
  stdin: null,
  pid: 1,
  kill: () => {},
});

/** `vi.mock` factories run before imports resolve, so reach this with an async factory. */
export const procStub = (code = 0, stdout = "") => ({
  run: vi.fn().mockResolvedValue({ code, stdout, stderr: "" }),
  spawn: vi.fn(() => exitedWith(code)),
});
