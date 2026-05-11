/**
 * `vexpo convex`. connects to or provisions a Convex deployment for the
 * project, then writes connection details to .env.local.
 *
 * Idempotent: if .env.local already has CONVEX_DEPLOYMENT, it just verifies
 * codegen by running `convex dev --once`. Pass --fresh to provision a brand
 * new deployment (wipes existing CONVEX_DEPLOYMENT lines).
 */

import { appleTeamIdFallback, bundleIdFallback, pkgName, scheme } from "../lib/app.ts";
import { envSet as convexEnvSet, isLoggedIn } from "../lib/convex-env.ts";
import { ensureLine, readAll, removeLines } from "../lib/env-local.ts";
import {
  BOLD,
  DIM,
  RESET,
  ask,
  bad,
  helpAndWait,
  line,
  nop,
  note,
  ok,
  section,
  yep,
} from "../lib/output.ts";
import { dlx } from "../lib/pkg-manager.ts";
import { spawn } from "../lib/proc.ts";
import { recordStep } from "../lib/state.ts";

export type ConvexOptions = {
  fresh?: boolean;
  local?: boolean;
  name?: string;
};

const BUNDLE_ID_RE = /^[A-Za-z0-9.-]+$/;
const TEAM_ID_RE = /^[A-Z0-9]{10}$/;

export async function runConvex(options: ConvexOptions): Promise<number> {
  section("Convex deployment");

  try {
    if (!(await isLoggedIn())) {
      yep("not signed in to Convex");
      await helpAndWait({
        body: "Sign up free and run `bunx convex login` in another terminal:",
        urls: [
          { label: "Convex sign-up", url: "https://convex.dev" },
          { label: "Convex dashboard", url: "https://dashboard.convex.dev" },
        ],
        allowSkip: true,
        skipLabel: "skip",
      });
    }

    const localEnv = await readAll();
    const existing = localEnv.get("CONVEX_DEPLOYMENT");

    if (options.fresh) {
      await removeLines([
        "CONVEX_DEPLOYMENT",
        "EXPO_PUBLIC_CONVEX_URL",
        "EXPO_PUBLIC_CONVEX_SITE_URL",
      ]);
    }

    const needsProvisioning = options.fresh === true || !existing;
    const projectName = options.name ?? (await pkgName());

    const cmd = [dlx(), "convex", "dev", "--once", "--tail-logs", "disable"];
    if (options.local) cmd.push("--local");
    if (needsProvisioning) cmd.push("--configure", "new", "--project", projectName);

    if (needsProvisioning) {
      ok(`provisioning Convex project '${projectName}'`);
    } else {
      ok(`connecting to existing deployment ${existing}`);
    }

    const proc = spawn(cmd, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    if ((await proc.exited) !== 0) {
      bad("convex dev exited with a non-zero code");
      return 1;
    }

    const refreshed = await readAll();
    const deployment = refreshed.get("CONVEX_DEPLOYMENT");
    if (!deployment) {
      bad("CONVEX_DEPLOYMENT missing after convex dev ran");
      return 1;
    }

    const slug = deployment.split("#")[0].trim().split(":")[1];
    if (!slug) {
      bad(`invalid CONVEX_DEPLOYMENT: ${deployment}`);
      return 1;
    }

    process.env.CONVEX_DEPLOYMENT = deployment;

    if (refreshed.has("EXPO_PUBLIC_CONVEX_URL")) {
      nop("EXPO_PUBLIC_CONVEX_URL already set");
    } else {
      await ensureLine("EXPO_PUBLIC_CONVEX_URL", `https://${slug}.convex.cloud`);
      ok("wrote EXPO_PUBLIC_CONVEX_URL");
    }
    if (refreshed.has("EXPO_PUBLIC_CONVEX_SITE_URL")) {
      nop("EXPO_PUBLIC_CONVEX_SITE_URL already set");
    } else {
      await ensureLine("EXPO_PUBLIC_CONVEX_SITE_URL", `https://${slug}.convex.site`);
      ok("wrote EXPO_PUBLIC_CONVEX_SITE_URL");
    }
    if (refreshed.has("EXPO_PUBLIC_SITE_URL")) {
      nop("EXPO_PUBLIC_SITE_URL already set");
    } else {
      const s = `${await scheme()}://`;
      await ensureLine("EXPO_PUBLIC_SITE_URL", s);
      ok(`wrote EXPO_PUBLIC_SITE_URL=${s}`);
    }

    await ensureIdentity(refreshed);

    // Persist the step so the orchestrator's probe + doctor can read it.
    // Without this, `.setup-state.json.steps.convex` stays empty and `vexpo
    // doctor` shows the phase as "-" even when the deployment is live.
    await recordStep("convex", {
      deployment,
      slug,
      ...(options.local ? { local: true } : {}),
    });

    line();
    ok(`Convex deployment ready: ${BOLD}${slug}${RESET}`);
    note(`dashboard: https://dashboard.convex.dev/d/${slug}`);
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

/**
 * Prompt for, persist, and push the iOS bundle id + Apple Team id. These are
 * needed in two places: (a) `.env.local` so `app.config.ts` resolves them at
 * Expo build time, and (b) the Convex deployment env so `convex/http.ts` can
 * serve the apple-app-site-association file with the right appID.
 */
async function ensureIdentity(localEnv: Map<string, string>): Promise<void> {
  const haveBundle = localEnv.has("EXPO_PUBLIC_APP_BUNDLE_ID");
  const haveTeam = localEnv.has("EXPO_PUBLIC_APPLE_TEAM_ID");

  let bundleId = localEnv.get("EXPO_PUBLIC_APP_BUNDLE_ID");
  let teamId = localEnv.get("EXPO_PUBLIC_APPLE_TEAM_ID");

  if (!haveBundle) {
    if (!process.stdin.isTTY) {
      yep("EXPO_PUBLIC_APP_BUNDLE_ID not set (non-TTY); skipping prompt");
      yep("set it in .env.local before running `vexpo apple` or building");
    } else {
      const fromConfig = await bundleIdFallback();
      const isTemplate = !fromConfig || fromConfig.startsWith("com.example.");
      const suggested = isTemplate ? `com.example.${await pkgName()}` : fromConfig;
      const cachedHint = isTemplate ? "" : ` ${DIM}(from app.config.ts)${RESET}`;
      const raw = (
        await ask(
          `  iOS bundle id ${DIM}(reverse-DNS, e.g. com.you.app)${RESET}${cachedHint}\n  ${DIM}> ${suggested} ${RESET}`,
        )
      ).trim();
      bundleId = raw || suggested;
      if (!BUNDLE_ID_RE.test(bundleId)) {
        throw new Error(`invalid bundle id '${bundleId}' (allowed: A-Z a-z 0-9 . -)`);
      }
      await ensureLine("EXPO_PUBLIC_APP_BUNDLE_ID", bundleId);
      ok(`wrote EXPO_PUBLIC_APP_BUNDLE_ID=${bundleId}`);
    }
  } else {
    nop(`EXPO_PUBLIC_APP_BUNDLE_ID already set (${bundleId})`);
  }

  if (!haveTeam) {
    if (!process.stdin.isTTY) {
      yep("EXPO_PUBLIC_APPLE_TEAM_ID not set (non-TTY); skipping prompt");
    } else {
      const fromConfig = await appleTeamIdFallback();
      const cachedHint = fromConfig ? ` ${DIM}[${fromConfig} from app.config.ts]${RESET}` : "";
      const raw = (
        await ask(
          `  Apple Team id ${DIM}(10-char alphanumeric, find at developer.apple.com/account)${RESET}${cachedHint}\n  ${DIM}> ${RESET}`,
        )
      )
        .trim()
        .toUpperCase();
      const value = raw || (fromConfig ?? "");
      if (!TEAM_ID_RE.test(value)) {
        throw new Error(`invalid Apple Team id '${value}' (must be 10 uppercase alphanumeric)`);
      }
      teamId = value;
      await ensureLine("EXPO_PUBLIC_APPLE_TEAM_ID", teamId);
      ok(`wrote EXPO_PUBLIC_APPLE_TEAM_ID=${teamId}`);
    }
  } else {
    nop(`EXPO_PUBLIC_APPLE_TEAM_ID already set (${teamId})`);
  }

  if (bundleId) {
    await convexEnvSet("APP_BUNDLE_ID", bundleId);
    ok(`Convex env: APP_BUNDLE_ID=${bundleId}`);
  }
  if (teamId) {
    await convexEnvSet("APPLE_TEAM_ID", teamId);
    ok(`Convex env: APPLE_TEAM_ID=${teamId}`);
  }
}
