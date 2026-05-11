import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ENV_FILE, ensureLine, readAll, readOne, removeLines } from "../../src/lib/env-local";

// `env-local.ts` reads/writes `.env.local` in the CURRENT working directory.
// Tests chdir into a temp dir so each scenario is hermetic.

let workdir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  workdir = await mkdtemp(path.join(tmpdir(), "env-local-test-"));
  process.chdir(workdir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workdir, { recursive: true, force: true });
});

describe("readAll", () => {
  it("returns an empty map when the file is absent", async () => {
    const result = await readAll();
    expect(result.size).toBe(0);
  });

  it("returns an empty map when the file is empty", async () => {
    await writeFile(ENV_FILE, "");
    const result = await readAll();
    expect(result.size).toBe(0);
  });

  it("parses a single key=value", async () => {
    await writeFile(ENV_FILE, "FOO=bar\n");
    const result = await readAll();
    expect(result.get("FOO")).toBe("bar");
    expect(result.size).toBe(1);
  });

  it("parses multiple key=value pairs", async () => {
    await writeFile(ENV_FILE, "FOO=bar\nBAZ=qux\nNUM=42\n");
    const result = await readAll();
    expect(result.get("FOO")).toBe("bar");
    expect(result.get("BAZ")).toBe("qux");
    expect(result.get("NUM")).toBe("42");
  });

  it("skips comment lines", async () => {
    await writeFile(ENV_FILE, "# this is a comment\nFOO=bar\n  # indented comment\n");
    const result = await readAll();
    expect(result.size).toBe(1);
    expect(result.get("FOO")).toBe("bar");
  });

  it("skips blank lines", async () => {
    await writeFile(ENV_FILE, "\n\nFOO=bar\n\n\nBAZ=qux\n");
    const result = await readAll();
    expect(result.size).toBe(2);
  });

  it("strips double-quoted values", async () => {
    await writeFile(ENV_FILE, 'FOO="bar baz"\n');
    expect((await readAll()).get("FOO")).toBe("bar baz");
  });

  it("strips single-quoted values", async () => {
    await writeFile(ENV_FILE, "FOO='bar baz'\n");
    expect((await readAll()).get("FOO")).toBe("bar baz");
  });

  it("strips inline trailing comments after unquoted values", async () => {
    await writeFile(ENV_FILE, "FOO=bar # comment\nBAZ=qux  # another\n");
    const r = await readAll();
    expect(r.get("FOO")).toBe("bar");
    expect(r.get("BAZ")).toBe("qux");
  });

  it("strips inline trailing comments after quoted values", async () => {
    await writeFile(ENV_FILE, 'FOO="bar baz" # trailing\n');
    expect((await readAll()).get("FOO")).toBe("bar baz");
  });

  it("preserves hash characters inside the value when unambiguous", async () => {
    // No space before `#`, so it's part of the value (per common .env semantics).
    await writeFile(ENV_FILE, "URL=https://example.com/path#fragment\n");
    expect((await readAll()).get("URL")).toBe("https://example.com/path#fragment");
  });

  it("trims whitespace around the key", async () => {
    await writeFile(ENV_FILE, "  FOO  =bar\n");
    expect((await readAll()).get("FOO")).toBe("bar");
  });

  it("trims whitespace around the value", async () => {
    await writeFile(ENV_FILE, "FOO=  bar  \n");
    expect((await readAll()).get("FOO")).toBe("bar");
  });

  it("skips lines that don't contain `=`", async () => {
    await writeFile(ENV_FILE, "this is not an env line\nFOO=bar\nbroken line\n");
    const r = await readAll();
    expect(r.size).toBe(1);
    expect(r.get("FOO")).toBe("bar");
  });

  it("skips lines starting with `=` (no key)", async () => {
    await writeFile(ENV_FILE, "=value-with-no-key\nFOO=bar\n");
    const r = await readAll();
    expect(r.size).toBe(1);
    expect(r.get("FOO")).toBe("bar");
  });

  it("handles `=` in the value (splits at first `=`)", async () => {
    await writeFile(ENV_FILE, "FOO=a=b=c\n");
    expect((await readAll()).get("FOO")).toBe("a=b=c");
  });

  it("handles an empty value", async () => {
    await writeFile(ENV_FILE, "FOO=\n");
    const r = await readAll();
    expect(r.has("FOO")).toBe(true);
    expect(r.get("FOO")).toBe("");
  });

  it("last duplicate key wins", async () => {
    await writeFile(ENV_FILE, "X=1\nX=2\nX=3\n");
    expect((await readAll()).get("X")).toBe("3");
  });

  it("strips a UTF-8 BOM at the start of the file", async () => {
    await writeFile(ENV_FILE, "﻿FOO=bar\n");
    expect((await readAll()).get("FOO")).toBe("bar");
  });

  it("handles CRLF line endings", async () => {
    await writeFile(ENV_FILE, "FOO=bar\r\nBAZ=qux\r\n");
    const r = await readAll();
    expect(r.get("FOO")).toBe("bar");
    expect(r.get("BAZ")).toBe("qux");
  });

  it("handles a double-quoted multi-line value", async () => {
    await writeFile(ENV_FILE, `KEY="line1\nline2\nline3"\nOTHER=keep\n`);
    const r = await readAll();
    expect(r.get("KEY")).toBe("line1\nline2\nline3");
    expect(r.get("OTHER")).toBe("keep");
  });

  it("handles a single-quoted multi-line value", async () => {
    await writeFile(ENV_FILE, `PEM='-----BEGIN-----\nLINE\n-----END-----'\n`);
    expect((await readAll()).get("PEM")).toBe("-----BEGIN-----\nLINE\n-----END-----");
  });

  it("preserves a quoted value that ends on the same line", async () => {
    await writeFile(ENV_FILE, `KEY="all on one line"\n`);
    expect((await readAll()).get("KEY")).toBe("all on one line");
  });
});

describe("readOne", () => {
  it("returns the value for an existing key", async () => {
    await writeFile(ENV_FILE, "FOO=bar\nBAZ=qux\n");
    expect(await readOne("FOO")).toBe("bar");
  });

  it("returns undefined for a missing key", async () => {
    await writeFile(ENV_FILE, "FOO=bar\n");
    expect(await readOne("MISSING")).toBeUndefined();
  });

  it("returns undefined when the file is absent", async () => {
    expect(await readOne("ANY")).toBeUndefined();
  });
});

describe("ensureLine", () => {
  it("creates the file with the key=value when absent", async () => {
    await ensureLine("FOO", "bar");
    const text = await readFile(ENV_FILE, "utf8");
    expect(text).toBe("FOO=bar\n");
  });

  it("appends a new key without disturbing existing keys", async () => {
    await writeFile(ENV_FILE, "EXISTING=keep\n");
    await ensureLine("FOO", "bar");
    const text = await readFile(ENV_FILE, "utf8");
    expect(text).toBe("EXISTING=keep\nFOO=bar\n");
  });

  it("is a no-op when the key already exists", async () => {
    await writeFile(ENV_FILE, "FOO=original\nBAR=keep\n");
    await ensureLine("FOO", "new-value");
    const text = await readFile(ENV_FILE, "utf8");
    expect(text).toBe("FOO=original\nBAR=keep\n");
  });

  it("appends a newline first when the file is missing the trailing newline", async () => {
    await writeFile(ENV_FILE, "FOO=bar");
    await ensureLine("BAZ", "qux");
    const text = await readFile(ENV_FILE, "utf8");
    expect(text).toBe("FOO=bar\nBAZ=qux\n");
  });

  it("handles a file with only a comment", async () => {
    await writeFile(ENV_FILE, "# comment\n");
    await ensureLine("FOO", "bar");
    const text = await readFile(ENV_FILE, "utf8");
    expect(text).toBe("# comment\nFOO=bar\n");
  });

  it("matches keys with prefix collision correctly (anchors on line start)", async () => {
    // `MY_API_KEY` shouldn't satisfy `ensureLine("API_KEY", ...)`. the regex
    // anchors at `^`, so this is a real duplicate.
    await writeFile(ENV_FILE, "MY_API_KEY=value\n");
    await ensureLine("API_KEY", "new");
    const text = await readFile(ENV_FILE, "utf8");
    expect(text).toContain("API_KEY=new");
    expect(text).toContain("MY_API_KEY=value");
  });
});

describe("removeLines", () => {
  it("is a no-op when the file is absent", async () => {
    await removeLines(["FOO"]);
    // No throw, no file created.
  });

  it("removes a single key", async () => {
    await writeFile(ENV_FILE, "FOO=bar\nBAZ=qux\n");
    await removeLines(["FOO"]);
    const text = await readFile(ENV_FILE, "utf8");
    expect(text).not.toContain("FOO=");
    expect(text).toContain("BAZ=qux");
  });

  it("removes multiple keys at once", async () => {
    await writeFile(ENV_FILE, "A=1\nB=2\nC=3\n");
    await removeLines(["A", "C"]);
    const text = await readFile(ENV_FILE, "utf8");
    expect(text).not.toContain("A=");
    expect(text).toContain("B=2");
    expect(text).not.toContain("C=");
  });

  it("leaves comments alone", async () => {
    await writeFile(ENV_FILE, "# header\nFOO=bar\n# section\nBAZ=qux\n");
    await removeLines(["FOO"]);
    const text = await readFile(ENV_FILE, "utf8");
    expect(text).toContain("# header");
    expect(text).toContain("# section");
    expect(text).toContain("BAZ=qux");
    expect(text).not.toContain("FOO=");
  });

  it("collapses three or more blank lines down to one blank between blocks", async () => {
    await writeFile(ENV_FILE, "A=1\nB=2\nC=3\nD=4\n");
    await removeLines(["B", "C"]);
    const text = await readFile(ENV_FILE, "utf8");
    expect(/\n{3,}/.test(text)).toBe(false);
  });

  it("does not remove keys with substring matches", async () => {
    await writeFile(ENV_FILE, "MY_KEY=keep\nKEY=remove\n");
    await removeLines(["KEY"]);
    const text = await readFile(ENV_FILE, "utf8");
    expect(text).toContain("MY_KEY=keep");
    expect(text).not.toMatch(/^KEY=/m);
  });
});
