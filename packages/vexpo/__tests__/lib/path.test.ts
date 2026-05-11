import { homedir } from "node:os";

import { describe, expect, it } from "vitest";

import { expandTilde } from "../../src/lib/path.ts";

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
