import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  currentRuntime,
  currentRuntimeVersion,
  detectPackageManager,
  dlx,
  dlxFor,
  installCmdFor,
  runCmdFor,
} from "../../src/lib/pkg-manager";

let workdir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  workdir = await mkdtemp(path.join(tmpdir(), "pkg-manager-test-"));
  process.chdir(workdir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workdir, { recursive: true, force: true });
});

describe("detectPackageManager", () => {
  it("detects bun via bun.lock", async () => {
    await writeFile("bun.lock", "");
    expect(await detectPackageManager()).toBe("bun");
  });

  it("detects bun via bun.lockb (binary lockfile)", async () => {
    await writeFile("bun.lockb", "");
    expect(await detectPackageManager()).toBe("bun");
  });

  it("detects pnpm via pnpm-lock.yaml", async () => {
    await writeFile("pnpm-lock.yaml", "");
    expect(await detectPackageManager()).toBe("pnpm");
  });

  it("detects yarn via yarn.lock", async () => {
    await writeFile("yarn.lock", "");
    expect(await detectPackageManager()).toBe("yarn");
  });

  it("defaults to npm when no lockfile is present", async () => {
    expect(await detectPackageManager()).toBe("npm");
  });

  it("prefers bun.lock over other lockfiles when both exist", async () => {
    await writeFile("bun.lock", "");
    await writeFile("yarn.lock", "");
    await writeFile("package-lock.json", "");
    expect(await detectPackageManager()).toBe("bun");
  });

  it("prefers pnpm over yarn when both exist", async () => {
    await writeFile("pnpm-lock.yaml", "");
    await writeFile("yarn.lock", "");
    expect(await detectPackageManager()).toBe("pnpm");
  });
});

describe("dlx", () => {
  it("returns bunx when running under bun, npx otherwise", () => {
    const result = dlx();
    if (process.versions.bun) {
      expect(result).toBe("bunx");
    } else {
      expect(result).toBe("npx");
    }
  });
});

describe("dlxFor", () => {
  it("returns bunx for bun", () => {
    expect(dlxFor("bun")).toBe("bunx");
  });

  it("returns pnpm dlx for pnpm", () => {
    expect(dlxFor("pnpm")).toBe("pnpm dlx");
  });

  it("returns yarn dlx for yarn", () => {
    expect(dlxFor("yarn")).toBe("yarn dlx");
  });

  it("returns npx for npm", () => {
    expect(dlxFor("npm")).toBe("npx");
  });
});

describe("installCmdFor", () => {
  it.each([
    ["bun", "bun install"],
    ["pnpm", "pnpm install"],
    ["yarn", "yarn install"],
    ["npm", "npm install"],
  ] as const)("returns %s install for %s", (pm, expected) => {
    expect(installCmdFor(pm)).toBe(expected);
  });
});

describe("runCmdFor", () => {
  it.each([
    ["bun", "bun run"],
    ["pnpm", "pnpm run"],
    ["yarn", "yarn"], // yarn doesn't use `yarn run`
    ["npm", "npm run"],
  ] as const)("returns %s for %s", (pm, expected) => {
    expect(runCmdFor(pm)).toBe(expected);
  });
});

describe("currentRuntime + currentRuntimeVersion", () => {
  it("reports bun or node correctly", () => {
    const runtime = currentRuntime();
    if (process.versions.bun) {
      expect(runtime).toBe("bun");
    } else {
      expect(runtime).toBe("node");
    }
  });

  it("returns the actual runtime version (bun's or node's)", () => {
    // Pin the real selection, not just non-empty: a regression returning some
    // other process.versions.* (v8, openssl) would pass a truthy/not-"?" check.
    expect(currentRuntimeVersion()).toBe(process.versions.bun ?? process.versions.node ?? "?");
  });
});
