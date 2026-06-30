import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ROUTING,
  buildPlan,
  missingKeys,
  readEnvFile,
  readSources,
  unrecognizedKeys,
} from "../../src/lib/env-files";

let originalCwd: string;
let workdir: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  workdir = await mkdtemp(path.join(tmpdir(), "env-files-test-"));
  process.chdir(workdir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workdir, { recursive: true, force: true });
});

describe("readEnvFile", () => {
  it("returns empty map when file is absent", async () => {
    const m = await readEnvFile(".env.local");
    expect(m.size).toBe(0);
  });

  it("parses KEY=value pairs", async () => {
    await writeFile(".env.local", "FOO=bar\nBAZ=qux\n");
    const m = await readEnvFile(".env.local");
    expect(m.get("FOO")).toBe("bar");
    expect(m.get("BAZ")).toBe("qux");
  });

  it("ignores comments and blank lines", async () => {
    await writeFile(".env.local", "# header\n\nFOO=bar\n# trailing\n");
    const m = await readEnvFile(".env.local");
    expect(m.size).toBe(1);
    expect(m.get("FOO")).toBe("bar");
  });

  it("handles single-line quoted values", async () => {
    await writeFile(".env.local", `FOO="hello world"\nBAR='one two'\n`);
    const m = await readEnvFile(".env.local");
    expect(m.get("FOO")).toBe("hello world");
    expect(m.get("BAR")).toBe("one two");
  });

  it("handles multi-line quoted values (PEM-style)", async () => {
    const pem = `-----BEGIN PRIVATE KEY-----\nMHc...AbCd\n-----END PRIVATE KEY-----`;
    await writeFile(".env.local", `APPLE_P8_PRIVATE_KEY="${pem}"\nNEXT=1\n`);
    const m = await readEnvFile(".env.local");
    expect(m.get("APPLE_P8_PRIVATE_KEY")).toBe(pem);
    expect(m.get("NEXT")).toBe("1");
  });

  it("strips inline trailing comments on unquoted values", async () => {
    await writeFile(".env.local", "FOO=bar # comment here\n");
    const m = await readEnvFile(".env.local");
    expect(m.get("FOO")).toBe("bar");
  });

  it("keeps trailing content after a closed quote without dropping later keys", async () => {
    // A close quote followed by trailing text (e.g. a display name) must end the
    // value, not start a multi-line scan that swallows every following key.
    await writeFile(
      ".env.local",
      `EMAIL_FROM="My App" <hi@app.com>\nRESEND_API_KEY=re_abc\nNAME=app\n`,
    );
    const m = await readEnvFile(".env.local");
    expect(m.get("EMAIL_FROM")).toBe("My App");
    expect(m.get("RESEND_API_KEY")).toBe("re_abc");
    expect(m.get("NAME")).toBe("app");
  });

  it("normalizes CRLF so multi-line quoted values carry no carriage returns", async () => {
    const pem = "-----BEGIN-----\nMHc\nAbCd\n-----END-----";
    await writeFile(".env.local", `KEY="${pem}"\nNEXT=1\n`.replace(/\n/g, "\r\n"));
    const m = await readEnvFile(".env.local");
    expect(m.get("KEY")).toBe(pem);
    expect(m.get("NEXT")).toBe("1");
  });

  it("keeps the partial value of an unterminated quote at EOF", async () => {
    await writeFile(".env.local", `KEY="oops`);
    const m = await readEnvFile(".env.local");
    expect(m.get("KEY")).toBe("oops");
  });
});

describe("readSources", () => {
  it("returns nothing when no files exist", async () => {
    const out = await readSources();
    expect(out.length).toBe(0);
  });

  it("reads .env.local and tags as dev", async () => {
    await writeFile(".env.local", "FOO=bar\n");
    const out = await readSources();
    expect(out.length).toBe(1);
    expect(out[0].channel).toBe("dev");
  });

  it("reads .env.prod and tags as prod", async () => {
    await writeFile(".env.prod", "FOO=bar\n");
    const out = await readSources();
    expect(out.length).toBe(1);
    expect(out[0].channel).toBe("prod");
    expect(out[0].path).toBe(".env.prod");
  });

  it("falls back to .env.production when .env.prod absent", async () => {
    await writeFile(".env.production", "FOO=bar\n");
    const out = await readSources();
    expect(out.length).toBe(1);
    expect(out[0].path).toBe(".env.production");
  });

  it(".env.prod takes precedence over .env.production", async () => {
    await writeFile(".env.prod", "FOO=prod\n");
    await writeFile(".env.production", "FOO=production\n");
    const out = await readSources();
    expect(out.length).toBe(1);
    expect(out[0].path).toBe(".env.prod");
  });

  it("reads both .env.local and .env.prod when both present", async () => {
    await writeFile(".env.local", "FOO=devv\n");
    await writeFile(".env.prod", "FOO=prodd\n");
    const out = await readSources();
    expect(out.length).toBe(2);
    expect(out.map((s) => s.channel).toSorted()).toEqual(["dev", "prod"]);
  });

  it("rejects an explicit --local-file that does not exist", async () => {
    await expect(readSources({ local: "/tmp/vexpo-test-nonexistent-local-file" })).rejects.toThrow(
      /--local-file path does not exist/,
    );
  });

  it("rejects an explicit --prod-file that does not exist", async () => {
    await writeFile(".env.local", "FOO=bar\n");
    await expect(readSources({ prod: "/tmp/vexpo-test-nonexistent-prod-file" })).rejects.toThrow(
      /--prod-file path does not exist/,
    );
  });

  it("default `.env.local` missing is fine (no error)", async () => {
    // Without --local-file flag, an absent .env.local is normal (lite-mode scaffold).
    const out = await readSources();
    expect(out.length).toBe(0);
  });

  it("default `.env.prod` missing is fine (no error)", async () => {
    await writeFile(".env.local", "FOO=bar\n");
    // Without --prod-file flag, an absent .env.prod is normal.
    const out = await readSources();
    expect(out.length).toBe(1);
    expect(out[0].channel).toBe("dev");
  });

  it("explicit --local-file overrides default path", async () => {
    await writeFile(".env.dev-explicit", "MY=value\n");
    const out = await readSources({ local: ".env.dev-explicit" });
    expect(out.length).toBe(1);
    expect(out[0].path).toBe(".env.dev-explicit");
    expect(out[0].entries.get("MY")).toBe("value");
  });
});

describe("buildPlan routing", () => {
  it("routes EXPO_PUBLIC_ keys from .env.local to EAS development only", async () => {
    await writeFile(".env.local", "EXPO_PUBLIC_CONVEX_URL=https://x.convex.cloud\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    expect(plan.length).toBe(1);
    const dest = plan[0].destinations[0];
    expect(dest.type).toBe("eas");
    if (dest.type === "eas") {
      expect(dest.environments).toEqual(["development"]);
    }
  });

  it("routes EXPO_PUBLIC_ keys from .env.prod to EAS production+preview", async () => {
    await writeFile(".env.prod", "EXPO_PUBLIC_CONVEX_URL=https://x.convex.cloud\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    expect(plan.length).toBe(1);
    const dest = plan[0].destinations[0];
    if (dest.type === "eas") {
      expect(dest.environments).toEqual(["production", "preview"]);
    } else {
      expect.fail("expected EAS destination");
    }
  });

  it("routes BETTER_AUTH_SECRET from .env.local to convex dev", async () => {
    await writeFile(".env.local", "BETTER_AUTH_SECRET=abcd1234\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    const dest = plan[0].destinations[0];
    if (dest.type === "convex") {
      expect(dest.channel).toBe("dev");
      expect(dest.key).toBe("BETTER_AUTH_SECRET");
    } else {
      expect.fail("expected Convex destination");
    }
  });

  it("routes BETTER_AUTH_SECRET from .env.prod to convex prod", async () => {
    await writeFile(".env.prod", "BETTER_AUTH_SECRET=abcd1234\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    const dest = plan[0].destinations[0];
    if (dest.type === "convex") {
      expect(dest.channel).toBe("prod");
    } else {
      expect.fail("expected Convex destination");
    }
  });

  it("routes REQUIRE_EMAIL_VERIFICATION from .env.local to convex dev", async () => {
    await writeFile(".env.local", "REQUIRE_EMAIL_VERIFICATION=true\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    const dest = plan[0].destinations[0];
    if (dest.type === "convex") {
      expect(dest.channel).toBe("dev");
      expect(dest.key).toBe("REQUIRE_EMAIL_VERIFICATION");
    } else {
      expect.fail("expected Convex destination");
    }
  });

  it("routes REQUIRE_EMAIL_VERIFICATION from .env.prod to convex prod", async () => {
    await writeFile(".env.prod", "REQUIRE_EMAIL_VERIFICATION=true\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    const dest = plan[0].destinations[0];
    if (dest.type === "convex") {
      expect(dest.channel).toBe("prod");
      expect(dest.key).toBe("REQUIRE_EMAIL_VERIFICATION");
    } else {
      expect.fail("expected Convex destination");
    }
  });

  it("routes APPLE_TEAM_ID from .env.prod to Convex prod (no gh-secret. dropped)", async () => {
    await writeFile(".env.prod", "APPLE_TEAM_ID=ABCDE12345\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    expect(plan.length).toBe(1);
    const types = plan[0].destinations.map((d) => d.type);
    expect(types).toEqual(["convex"]);
  });

  it("routes APPLE_TEAM_ID from .env.local to Convex dev only", async () => {
    await writeFile(".env.local", "APPLE_TEAM_ID=ABCDE12345\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    const types = plan[0].destinations.map((d) => d.type);
    expect(types).toEqual(["convex"]);
  });

  it("renames APPLE_SERVICES_ID to APPLE_CLIENT_ID on Convex", async () => {
    await writeFile(".env.prod", "APPLE_SERVICES_ID=com.x.app.signin\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    expect(plan.length).toBe(1);
    expect(plan[0].destinations.length).toBe(1);
    const convexDest = plan[0].destinations[0];
    if (convexDest.type === "convex") {
      expect(convexDest.key).toBe("APPLE_CLIENT_ID");
    } else {
      expect.fail("expected single Convex destination");
    }
  });

  it("APPLE_P8_PRIVATE_KEY is unrecognized (manual eas env:create --visibility secret)", async () => {
    await writeFile(".env.prod", "APPLE_P8_PRIVATE_KEY=-----BEGIN-----\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    expect(plan.length).toBe(0);
    const unknown = unrecognizedKeys(sources);
    expect(unknown).toContain("APPLE_P8_PRIVATE_KEY");
  });

  it("CONVEX_DEPLOY_KEY is unrecognized (manual eas env:create --visibility secret)", async () => {
    await writeFile(".env.prod", "CONVEX_DEPLOY_KEY=prod:foo|ey...\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    expect(plan.length).toBe(0);
    const unknown = unrecognizedKeys(sources);
    expect(unknown).toContain("CONVEX_DEPLOY_KEY");
  });

  it("ignores CONVEX_DEPLOYMENT (file-local pointer)", async () => {
    await writeFile(".env.local", "CONVEX_DEPLOYMENT=dev:happy-frog-12\nFOO=bar\n");
    const sources = await readSources();
    const plan = buildPlan(sources);
    expect(plan.find((p) => p.sourceKey === "CONVEX_DEPLOYMENT")).toBeUndefined();
  });
});

describe("unrecognizedKeys", () => {
  it("returns keys not in ROUTING and not in IGNORED", async () => {
    await writeFile(".env.local", "FOO=bar\nBETTER_AUTH_SECRET=x\nGRUMP=z\n");
    const sources = await readSources();
    const unknown = unrecognizedKeys(sources);
    expect(unknown).toContain("FOO");
    expect(unknown).toContain("GRUMP");
    expect(unknown).not.toContain("BETTER_AUTH_SECRET");
  });
});

describe("missingKeys", () => {
  it("reports keys in ROUTING that aren't in any source", async () => {
    await writeFile(".env.local", "BETTER_AUTH_SECRET=x\n");
    const sources = await readSources();
    const { dev, prod } = missingKeys(sources);
    expect(dev).toContain("RESEND_API_KEY");
    expect(dev).not.toContain("BETTER_AUTH_SECRET");
    expect(prod).toContain("BETTER_AUTH_SECRET");
  });
});

it("ROUTING covers all expected keys", () => {
  const keys = Object.keys(ROUTING);
  expect(keys).toContain("BETTER_AUTH_SECRET");
  expect(keys).toContain("RESEND_API_KEY");
  expect(keys).toContain("REQUIRE_EMAIL_VERIFICATION");
  expect(keys).toContain("APPLE_CLIENT_SECRET");
  expect(keys).toContain("APPLE_SERVICES_ID");
  // APPLE_P8_PRIVATE_KEY and CONVEX_DEPLOY_KEY are NOT in ROUTING. they need
  // `eas env:create --visibility secret` and live in MANUAL_EAS_SECRETS instead.
  expect(keys).not.toContain("APPLE_P8_PRIVATE_KEY");
  expect(keys).not.toContain("CONVEX_DEPLOY_KEY");
});
