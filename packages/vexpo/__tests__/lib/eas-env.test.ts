import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveProjectId } from "../../src/lib/eas-env";

let workdir: string;
let originalCwd: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  originalCwd = process.cwd();
  originalEnv = process.env.EAS_PROJECT_ID;
  delete process.env.EAS_PROJECT_ID;
  workdir = await mkdtemp(path.join(tmpdir(), "eas-env-test-"));
  process.chdir(workdir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalEnv === undefined) {
    delete process.env.EAS_PROJECT_ID;
  } else {
    process.env.EAS_PROJECT_ID = originalEnv;
  }
  await rm(workdir, { recursive: true, force: true });
});

describe("resolveProjectId / app.json source", () => {
  it("returns the projectId from a well-formed app.json", async () => {
    await writeFile(
      "app.json",
      JSON.stringify({
        expo: {
          extra: { eas: { projectId: "abc-123-def-456" } },
        },
      }),
    );
    expect(await resolveProjectId()).toBe("abc-123-def-456");
  });

  it("returns null when app.json is missing and no env or .env.local", async () => {
    expect(await resolveProjectId()).toBeNull();
  });

  it("falls through when app.json is malformed JSON", async () => {
    await writeFile("app.json", "{ not json");
    expect(await resolveProjectId()).toBeNull();
  });

  it("falls through when expo.extra.eas is missing", async () => {
    await writeFile("app.json", JSON.stringify({ expo: { name: "x" } }));
    expect(await resolveProjectId()).toBeNull();
  });

  it("falls through when expo.extra.eas.projectId is empty string", async () => {
    await writeFile("app.json", JSON.stringify({ expo: { extra: { eas: { projectId: "" } } } }));
    expect(await resolveProjectId()).toBeNull();
  });

  it("falls through when app.json has no top-level `expo`", async () => {
    await writeFile("app.json", JSON.stringify({ unrelated: true }));
    expect(await resolveProjectId()).toBeNull();
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
    expect(await resolveProjectId()).toBe("id-1");
  });
});

describe("resolveProjectId / env var source", () => {
  it("reads process.env.EAS_PROJECT_ID when app.json is absent", async () => {
    process.env.EAS_PROJECT_ID = "from-env-1";
    expect(await resolveProjectId()).toBe("from-env-1");
  });

  it("reads process.env.EAS_PROJECT_ID when app.json has no projectId", async () => {
    await writeFile("app.json", JSON.stringify({ expo: {} }));
    process.env.EAS_PROJECT_ID = "from-env-2";
    expect(await resolveProjectId()).toBe("from-env-2");
  });

  it("ignores empty string env value", async () => {
    process.env.EAS_PROJECT_ID = "";
    expect(await resolveProjectId()).toBeNull();
  });

  it("app.json wins over env when both are set", async () => {
    await writeFile(
      "app.json",
      JSON.stringify({ expo: { extra: { eas: { projectId: "from-json" } } } }),
    );
    process.env.EAS_PROJECT_ID = "from-env";
    expect(await resolveProjectId()).toBe("from-json");
  });
});

describe("resolveProjectId / .env.local source", () => {
  it("reads EAS_PROJECT_ID from .env.local when app.json + process.env are unset", async () => {
    await writeFile(".env.local", "EAS_PROJECT_ID=from-dotenv\n");
    expect(await resolveProjectId()).toBe("from-dotenv");
  });

  it("process.env wins over .env.local when both are set", async () => {
    await writeFile(".env.local", "EAS_PROJECT_ID=from-dotenv\n");
    process.env.EAS_PROJECT_ID = "from-process";
    expect(await resolveProjectId()).toBe("from-process");
  });

  it("app.json wins over .env.local", async () => {
    await writeFile(
      "app.json",
      JSON.stringify({ expo: { extra: { eas: { projectId: "from-json" } } } }),
    );
    await writeFile(".env.local", "EAS_PROJECT_ID=from-dotenv\n");
    expect(await resolveProjectId()).toBe("from-json");
  });

  it("handles quoted values in .env.local", async () => {
    await writeFile(".env.local", `EAS_PROJECT_ID="quoted-value"\n`);
    expect(await resolveProjectId()).toBe("quoted-value");
  });

  it("ignores other keys in .env.local", async () => {
    await writeFile(".env.local", "OTHER_KEY=foo\nEAS_PROJECT_ID=correct\nMORE=bar\n");
    expect(await resolveProjectId()).toBe("correct");
  });

  it("exports the .env.local value to process.env for subprocess inheritance", async () => {
    await writeFile(".env.local", "EAS_PROJECT_ID=from-dotenv-export\n");
    expect(process.env.EAS_PROJECT_ID).toBeUndefined();
    expect(await resolveProjectId()).toBe("from-dotenv-export");
    // Side effect: subsequent subprocess spawns (e.g. eas project:info) now
    // see the value via the inherited environment.
    expect(process.env.EAS_PROJECT_ID).toBe("from-dotenv-export");
  });

  it("does not overwrite process.env when app.json wins", async () => {
    await writeFile(
      "app.json",
      JSON.stringify({ expo: { extra: { eas: { projectId: "from-json" } } } }),
    );
    await writeFile(".env.local", "EAS_PROJECT_ID=from-dotenv\n");
    expect(process.env.EAS_PROJECT_ID).toBeUndefined();
    expect(await resolveProjectId()).toBe("from-json");
    // We didn't reach the .env.local branch, so process.env stays untouched.
    expect(process.env.EAS_PROJECT_ID).toBeUndefined();
  });
});
