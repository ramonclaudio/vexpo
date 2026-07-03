/**
 * Real e2e against the live Convex Platform API. Opt-in and reversible: skips
 * unless you're logged in (~/.convex/config.json) AND set VEXPO_E2E_CONVEX=1 AND
 * VEXPO_E2E_DEPLOYMENT=<a dev deployment slug>. The enumerate test is read-only
 * and the env probe reverses itself in a finally. Never point it at a prod slug.
 *
 *   VEXPO_E2E_CONVEX=1 VEXPO_E2E_DEPLOYMENT=happy-otter-123 npx vitest run e2e
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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

const DEPLOYMENT = process.env.VEXPO_E2E_DEPLOYMENT ?? "";
const RUN = loggedIn() && process.env.VEXPO_E2E_CONVEX === "1" && DEPLOYMENT.length > 0;

describe.skipIf(!RUN)("convex platform API (real)", () => {
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
