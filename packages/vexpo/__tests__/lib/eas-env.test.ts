import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { projectIdFromAppJson } from "../../src/lib/eas-env";

let workdir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  workdir = await mkdtemp(path.join(tmpdir(), "eas-env-test-"));
  process.chdir(workdir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workdir, { recursive: true, force: true });
});

describe("projectIdFromAppJson", () => {
  it("returns the projectId from a well-formed app.json", async () => {
    await writeFile(
      "app.json",
      JSON.stringify({
        expo: {
          extra: { eas: { projectId: "abc-123-def-456" } },
        },
      }),
    );
    expect(await projectIdFromAppJson()).toBe("abc-123-def-456");
  });

  it("returns null when app.json is missing", async () => {
    expect(await projectIdFromAppJson()).toBeNull();
  });

  it("returns null when app.json is malformed JSON", async () => {
    await writeFile("app.json", "{ not json");
    expect(await projectIdFromAppJson()).toBeNull();
  });

  it("returns null when expo.extra.eas is missing", async () => {
    await writeFile("app.json", JSON.stringify({ expo: { name: "x" } }));
    expect(await projectIdFromAppJson()).toBeNull();
  });

  it("returns null when expo.extra.eas.projectId is empty string", async () => {
    await writeFile("app.json", JSON.stringify({ expo: { extra: { eas: { projectId: "" } } } }));
    // Empty string is falsy under `?? null`. should return null.
    expect(await projectIdFromAppJson()).toBeNull();
  });

  it("returns null when app.json has no top-level `expo`", async () => {
    await writeFile("app.json", JSON.stringify({ unrelated: true }));
    expect(await projectIdFromAppJson()).toBeNull();
  });

  it("tolerates extra unknown keys in app.json", async () => {
    await writeFile(
      "app.json",
      JSON.stringify({
        expo: {
          extra: { eas: { projectId: "id-1" }, somethingElse: { foo: "bar" } },
        },
        unknownTopLevel: 123,
      }),
    );
    expect(await projectIdFromAppJson()).toBe("id-1");
  });
});
