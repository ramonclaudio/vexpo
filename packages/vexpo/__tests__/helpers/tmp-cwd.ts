import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach } from "vitest";

/** Call before any other `beforeEach` that writes into the cwd, so the chdir lands first. */
export function useTmpCwd(prefix: string): { path: string } {
  const dir = { path: "" };
  let originalCwd = "";

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir.path = await mkdtemp(path.join(tmpdir(), prefix));
    process.chdir(dir.path);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir.path, { recursive: true, force: true });
  });

  return dir;
}
