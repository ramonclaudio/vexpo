import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CREDENTIALS_DIR, expandTilde, stagedP8 } from "../../src/lib/path.ts";

describe("expandTilde", () => {
  it("expands bare ~ to homedir", () => {
    expect(expandTilde("~")).toBe(homedir());
  });

  it("expands ~/path/to/file", () => {
    expect(expandTilde("~/foo/bar.p8")).toBe(`${homedir()}/foo/bar.p8`);
  });

  it("leaves absolute paths untouched", () => {
    expect(expandTilde("/etc/passwd")).toBe("/etc/passwd");
  });

  it("leaves relative paths untouched", () => {
    expect(expandTilde("./foo")).toBe("./foo");
    expect(expandTilde("foo/bar")).toBe("foo/bar");
  });

  it("does not expand mid-string tildes", () => {
    expect(expandTilde("/etc/~user/file")).toBe("/etc/~user/file");
    expect(expandTilde("foo~bar")).toBe("foo~bar");
  });

  it("does not expand ~user (other-user homedirs)", () => {
    // bash expands ~alice to /home/alice; we don't, since the CLI takes file
    // paths the current user has access to.
    expect(expandTilde("~alice/file")).toBe("~alice/file");
  });
});

describe("stagedP8", () => {
  let workdir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    workdir = await mkdtemp(path.join(tmpdir(), "staged-p8-test-"));
    process.chdir(workdir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(workdir, { recursive: true, force: true });
  });

  it("returns undefined when credentials/ is absent", () => {
    expect(stagedP8()).toBeUndefined();
  });

  it("returns undefined when credentials/ holds no .p8", async () => {
    await mkdir(CREDENTIALS_DIR);
    await writeFile(path.join(CREDENTIALS_DIR, "README.md"), "x");
    expect(stagedP8()).toBeUndefined();
  });

  it("returns the single staged .p8, ignoring non-.p8 files", async () => {
    await mkdir(CREDENTIALS_DIR);
    await writeFile(path.join(CREDENTIALS_DIR, "README.md"), "x");
    await writeFile(path.join(CREDENTIALS_DIR, "asc-key.p8"), "x");
    expect(stagedP8()).toBe(path.join(CREDENTIALS_DIR, "asc-key.p8"));
  });

  it("returns undefined when several .p8 are present (ambiguous, won't guess)", async () => {
    await mkdir(CREDENTIALS_DIR);
    await writeFile(path.join(CREDENTIALS_DIR, "AuthKey_A.p8"), "x");
    await writeFile(path.join(CREDENTIALS_DIR, "AuthKey_B.p8"), "x");
    expect(stagedP8()).toBeUndefined();
  });
});
