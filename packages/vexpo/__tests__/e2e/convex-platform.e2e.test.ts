/**
 * Real e2e against the live Convex Platform API. Opt-in and reversible: skips
 * unless you're logged in (~/.convex/config.json) AND set VEXPO_E2E_CONVEX=1 AND
 * VEXPO_E2E_DEPLOYMENT=<a dev deployment slug>. It also needs `templates/default`
 * to have its dependencies installed, because that is the project the Convex CLI
 * runs from. The enumerate test is read-only and the env probe reverses itself in
 * a finally. Never point it at a prod slug.
 *
 * The slug is the bare name, not what `.env.local` holds: `CONVEX_DEPLOYMENT`
 * there is `dev:<slug>` followed by a `#` comment naming the team and project.
 *
 *   VEXPO_E2E_CONVEX=1 VEXPO_E2E_DEPLOYMENT=happy-otter-123 npx vitest run e2e
 */

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

// Two constraints decide where `convex env` can run from, and they rule out
// both obvious answers. The CLI refuses to run outside a project that declares
// `convex`, so not the package. And `--deployment` resolves through the Platform
// API on the user login, which a project holding a CONVEX_DEPLOY_KEY in
// `.env.local` never reaches (it authenticates as the key instead), so not the
// template scaffold either. What is left is a throwaway project that declares
// the dependency and borrows the template's installed copy.
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

  // The `convex env` set/list/remove path is what `vexpo better-auth` and every
  // env-push step drives. Set a probe var on the dev deployment, read it back,
  // then remove it (reversible in a finally).
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
