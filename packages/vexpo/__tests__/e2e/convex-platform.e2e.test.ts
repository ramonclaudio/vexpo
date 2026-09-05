import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { envMap, envSet } from "../../src/lib/convex-env.ts";
import {
  checkToken,
  listProjectDeployments,
  resolveProdDeployment,
} from "../../src/lib/convex-management.ts";
import { dlx } from "../../src/lib/pkg-manager.ts";
import { run } from "../../src/lib/proc.ts";

function loggedIn(): boolean {
  try {
    const p = join(homedir(), ".convex", "config.json");
    return (
      existsSync(p) &&
      !!(JSON.parse(readFileSync(p, "utf8")) as { accessToken?: string }).accessToken
    );
  } catch {
    return false;
  }
}

const TEMPLATE = join(import.meta.dirname, "..", "..", "..", "..", "templates", "default");
const installed = existsSync(join(TEMPLATE, "node_modules", "convex"));

function probeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "vexpo-e2e-"));
  const pkg = {
    name: "vexpo-e2e-probe",
    version: "0.0.0",
    private: true,
    dependencies: { convex: "*" },
  };
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  mkdirSync(join(dir, "node_modules"));
  for (const entry of ["convex", ".bin"]) {
    symlinkSync(join(TEMPLATE, "node_modules", entry), join(dir, "node_modules", entry));
  }
  return dir;
}

const DEPLOYMENT = process.env.VEXPO_E2E_DEPLOYMENT ?? "";
const RUN =
  loggedIn() && process.env.VEXPO_E2E_CONVEX === "1" && DEPLOYMENT.length > 0 && installed;

describe.skipIf(!RUN)("convex platform API (real)", () => {
  const cwd = process.cwd();
  beforeAll(() => process.chdir(probeProject()));
  afterAll(() => process.chdir(cwd));

  it("validates the live login token (read-only)", async () => {
    expect(await checkToken()).toBe("valid");
  });

  it("enumerates the project's deployments (read-only)", async () => {
    const list = await listProjectDeployments(DEPLOYMENT);
    expect(list).not.toBeNull();
    expect(list!.length).toBeGreaterThan(0);
    for (const d of list!) {
      expect(typeof d.name).toBe("string");
      expect(["dev", "prod", "preview", "custom"]).toContain(d.deploymentType);
    }
    const prod = await resolveProdDeployment(DEPLOYMENT);
    expect(prod === null || typeof prod === "string").toBe(true);
  });

  it("sets then removes a Convex env var (reversible)", async () => {
    const target = { deployment: DEPLOYMENT };
    const name = "VEXPO_E2E_PROBE";
    const value = `probe-${Date.now()}`;
    try {
      await envSet(name, value, target);
      expect((await envMap(target)).get(name)).toBe(value);
    } finally {
      await run([dlx(), "convex", "env", "remove", "--deployment", DEPLOYMENT, name]);
    }
    expect((await envMap(target)).has(name)).toBe(false);
  });
});
