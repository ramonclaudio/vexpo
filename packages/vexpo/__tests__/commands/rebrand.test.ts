import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/pkg-manager.ts", () => ({ dlx: () => "bunx" }));
vi.mock("../../src/lib/proc.ts", () => ({
  run: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
}));
vi.mock("../../src/lib/output.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/output.ts")>();
  return { ...actual, ask: vi.fn() };
});

import { runRebrand } from "../../src/commands/rebrand.ts";
import { readAll } from "../../src/lib/env-local.ts";
import { ask } from "../../src/lib/output.ts";
import { run } from "../../src/lib/proc.ts";

const runSpy = run as unknown as ReturnType<typeof vi.fn>;

// envSet routes the value through a `--from-file` temp file (never argv), so
// capture that file's contents to assert on the value that reaches Convex.
const fromFileWrites: string[] = [];

// app.config.ts must carry the exact template lines rewriteAppConfig and
// detectTemplateDefaults match against.
const APP_CONFIG = `const pkg = { name: "vexpo" };
const BUNDLE_ID = process.env.EXPO_PUBLIC_APP_BUNDLE_ID ?? \`com.example.\${pkg.name}\`;
export default {
  name: IS_DEV ? "Vexpo (Dev)" : "Vexpo",
  slug: "vexpo",
  scheme: "vexpo",
};
`;

const STORE_CONFIG = {
  configVersion: 0,
  apple: {
    copyright: "YEAR YOUR_NAME",
    categories: ["DEVELOPER_TOOLS"],
    info: { "en-US": { title: "x", marketingUrl: "", supportUrl: "", privacyPolicyUrl: "" } },
    advisory: {},
    review: { firstName: "", lastName: "", email: "", phone: "" },
    release: {},
    releaseNotes: {},
    promotionalText: {},
  },
};

const FLAGS = {
  appName: "Foobar",
  bundleId: "com.acme.foobar",
  ownerName: "Ada Lovelace",
  reviewEmail: "ada@example.com",
};

let originalCwd: string;
let workdir: string;

async function seed(): Promise<void> {
  await writeFile("app.config.ts", APP_CONFIG);
  await writeFile("app.json", JSON.stringify({ expo: { extra: { eas: { projectId: "p" } } } }));
  await writeFile("package.json", JSON.stringify({ name: "vexpo", version: "1.0.0" }));
  await writeFile("store.config.json", JSON.stringify(STORE_CONFIG));
}

beforeEach(async () => {
  originalCwd = process.cwd();
  workdir = await mkdtemp(path.join(tmpdir(), "rebrand-test-"));
  process.chdir(workdir);
  fromFileWrites.length = 0;
  runSpy.mockReset();
  runSpy.mockImplementation(async (argv: string[]) => {
    const i = argv.indexOf("--from-file");
    if (i >= 0) {
      const { readFileSync } = await import("node:fs");
      try {
        fromFileWrites.push(readFileSync(argv[i + 1], "utf8"));
      } catch {}
    }
    return { code: 0, stdout: "", stderr: "" };
  });
  await seed();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workdir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("runRebrand non-TTY", () => {
  it("succeeds end to end with all required flags + --yes", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    const exit = await runRebrand({ ...FLAGS, yes: true });
    expect(exit).toBe(0);

    const cfg = await readFile("app.config.ts", "utf8");
    expect(cfg).toContain(`?? "com.acme.foobar"`);
    expect(cfg).toContain(`name: IS_DEV ? "Foobar (Dev)" : "Foobar"`);
    expect(cfg).toContain(`slug: "foobar"`);

    const pkg = JSON.parse(await readFile("package.json", "utf8")) as { name: string };
    expect(pkg.name).toBe("foobar");
  });

  it("errors (exit 1) without the required flags", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    const exit = await runRebrand({ yes: true });
    expect(exit).toBe(1);

    // nothing rewritten
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as { name: string };
    expect(pkg.name).toBe("vexpo");
  });
});

describe("runRebrand bundle id sync", () => {
  it("overwrites a stale EXPO_PUBLIC_APP_BUNDLE_ID and pushes to Convex when a deployment exists", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    await writeFile(
      ".env.local",
      "EXPO_PUBLIC_APP_BUNDLE_ID=com.old.stale\nCONVEX_DEPLOYMENT=dev:happy-frog-12\n",
    );

    process.env.CONVEX_DEPLOYMENT = "dev:happy-frog-12";
    try {
      const exit = await runRebrand({ ...FLAGS, yes: true });
      expect(exit).toBe(0);
    } finally {
      delete process.env.CONVEX_DEPLOYMENT;
    }

    const env = await readAll();
    expect(env.get("EXPO_PUBLIC_APP_BUNDLE_ID")).toBe("com.acme.foobar");

    const setCall = runSpy.mock.calls.find((c) => {
      const argv = c[0] as string[];
      return argv.includes("set") && argv.includes("--from-file");
    });
    expect(setCall).toBeDefined();
    const argv = setCall![0] as string[];
    const depFlag = argv.indexOf("--deployment");
    expect(depFlag).toBeGreaterThan(-1);
    expect(argv[depFlag + 1]).toBe("happy-frog-12");
    expect(fromFileWrites.some((c) => c.includes("APP_BUNDLE_ID=com.acme.foobar"))).toBe(true);
    expect(fromFileWrites.every((c) => !c.includes("com.old.stale"))).toBe(true);
  });

  it("does not push to Convex when no deployment is configured, but still writes .env.local", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    const exit = await runRebrand({ ...FLAGS, yes: true });
    expect(exit).toBe(0);

    const env = await readAll();
    expect(env.get("EXPO_PUBLIC_APP_BUNDLE_ID")).toBe("com.acme.foobar");

    const setCall = runSpy.mock.calls.find((c) => {
      const argv = c[0] as string[];
      return argv.includes("set") && argv.includes("--from-file");
    });
    expect(setCall).toBeUndefined();
  });
});

describe("runRebrand rewrite correctness", () => {
  it("--force re-run rewrites the bundle id after the first rebrand quoted it", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    expect(await runRebrand({ ...FLAGS, yes: true })).toBe(0);
    // app.config.ts now carries the double-quote form `?? "com.acme.foobar"`.
    expect(
      await runRebrand({ ...FLAGS, bundleId: "com.acme.second", force: true, yes: true }),
    ).toBe(0);

    const cfg = await readFile("app.config.ts", "utf8");
    expect(cfg).toContain(`?? "com.acme.second"`);
    expect(cfg).not.toContain("com.acme.foobar");
  });

  it("--force re-run still rewrites after a quoted app name (escape-aware markers)", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    const first = 'E2E "Smoke" App';

    expect(await runRebrand({ ...FLAGS, appName: first, yes: true })).toBe(0);
    // The escaped literal must still satisfy validation and get rewritten.
    expect(
      await runRebrand({
        ...FLAGS,
        appName: "Second App",
        scheme: "second",
        force: true,
        yes: true,
      }),
    ).toBe(0);

    const cfg = await readFile("app.config.ts", "utf8");
    expect(cfg).toContain(`name: IS_DEV ? "Second App (Dev)" : "Second App",`);
    expect(cfg).toContain(`scheme: "second",`);
    expect(cfg).not.toContain("Smoke");
  });

  it("--force re-run reads a single-quoted name left by a formatter", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    expect(await runRebrand({ ...FLAGS, appName: 'E2E "Smoke" App', yes: true })).toBe(0);
    // A fewest-escapes format pass flips the escaped double-quoted literal to
    // single quotes; markers must still read it.
    const cfg = await readFile("app.config.ts", "utf8");
    await writeFile(
      "app.config.ts",
      cfg.replace(
        `name: IS_DEV ? "E2E \\"Smoke\\" App (Dev)" : "E2E \\"Smoke\\" App",`,
        `name: IS_DEV ? 'E2E "Smoke" App (Dev)' : 'E2E "Smoke" App',`,
      ),
    );
    expect((await readFile("app.config.ts", "utf8")).includes("'E2E")).toBe(true);

    expect(
      await runRebrand({ ...FLAGS, appName: "Third App", scheme: "third", force: true, yes: true }),
    ).toBe(0);
    expect(await readFile("app.config.ts", "utf8")).toContain(
      `name: IS_DEV ? "Third App (Dev)" : "Third App",`,
    );
  });

  it("inserts values containing $& verbatim instead of expanding replacement patterns", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    const exit = await runRebrand({ ...FLAGS, appName: "Foo$&Bar", yes: true });
    expect(exit).toBe(0);

    const cfg = await readFile("app.config.ts", "utf8");
    expect(cfg).toContain(`name: IS_DEV ? "Foo$&Bar (Dev)" : "Foo$&Bar"`);
  });

  it("escapes a double-quote in the app name instead of corrupting the literal", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    const name = 'Foo "Bar"';

    expect(await runRebrand({ ...FLAGS, appName: name, yes: true })).toBe(0);

    const cfg = await readFile("app.config.ts", "utf8");
    expect(cfg).toContain(
      `name: IS_DEV ? ${JSON.stringify(`${name} (Dev)`)} : ${JSON.stringify(name)},`,
    );
    expect(cfg).not.toContain(`"Foo "Bar" (Dev)"`);
  });

  it("escapes a backslash in the app name instead of corrupting the literal", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    const name = "Foo\\Bar";

    expect(await runRebrand({ ...FLAGS, appName: name, yes: true })).toBe(0);

    const cfg = await readFile("app.config.ts", "utf8");
    expect(cfg).toContain(
      `name: IS_DEV ? ${JSON.stringify(`${name} (Dev)`)} : ${JSON.stringify(name)},`,
    );
  });
});

describe("runRebrand derived defaults", () => {
  it("derives the bundle id org from the owner, not a repeat of the app", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    vi.mocked(ask)
      .mockResolvedValueOnce("Foo Bar") // app name
      .mockResolvedValueOnce("Ada Lovelace") // your name
      .mockResolvedValueOnce("") // bundle id -> falls back to the hint
      .mockResolvedValueOnce("ada@example.com"); // review email

    expect(await runRebrand({ yes: true })).toBe(0);

    const cfg = await readFile("app.config.ts", "utf8");
    expect(cfg).toContain(`?? "com.adalovelace.foobar"`);
    expect(cfg).not.toContain("com.foobar.foobar");
  });
});

describe("runRebrand preflight atomicity", () => {
  it("leaves every target untouched when store.config.json has the wrong shape", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    // apple.info has no en-US, so the (sequential) store rewrite throws only
    // after app.config.ts / app.json / package.json were already rewritten.
    await writeFile(
      "store.config.json",
      JSON.stringify({ configVersion: 0, apple: { info: {}, review: {} } }),
    );

    const exit = await runRebrand({ ...FLAGS, yes: true });
    expect(exit).toBe(1);

    // Nothing should have been mutated: a half-rebrand leaves the project in a
    // state where a re-run reports "nothing to rebrand".
    const cfg = await readFile("app.config.ts", "utf8");
    expect(cfg).toContain(`slug: "vexpo"`);
    expect(cfg).not.toContain("com.acme.foobar");
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as { name: string };
    expect(pkg.name).toBe("vexpo");
    const appJson = JSON.parse(await readFile("app.json", "utf8")) as {
      expo: { extra: { eas: { projectId?: string } } };
    };
    expect(appJson.expo.extra.eas.projectId).toBe("p");
  });
});

describe("runRebrand interactive failure", () => {
  it("returns 1 instead of exiting the process when the app name is empty", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    vi.mocked(ask).mockResolvedValue("");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    try {
      const exit = await runRebrand({ reviewEmail: "ada@example.com", yes: true });
      expect(exitSpy).not.toHaveBeenCalled();
      expect(exit).toBe(1);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
