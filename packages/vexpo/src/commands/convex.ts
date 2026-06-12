import { appleTeamIdFallback, bundleIdFallback, pkgName, scheme } from "../lib/app.ts";
import { envSet as convexEnvSet } from "../lib/convex-env.ts";
import { checkToken } from "../lib/convex-management.ts";
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

export type TeamIdInput = { kind: "skip" } | { kind: "invalid" | "ok"; value: string };

export function resolveTeamIdInput(raw: string, fromConfig: string | null): TeamIdInput {
  const value = raw.trim().toUpperCase() || (fromConfig ?? "");
  if (!value) return { kind: "skip" };
  if (!TEAM_ID_RE.test(value)) return { kind: "invalid", value };
  return { kind: "ok", value };
}

/**
 * `--local` on `convex dev` is a deprecated option that crashes (convex 1.39+),
 * so a local target is selected the supported way: `--dev-deployment local` when
 * provisioning fresh, or a prior `convex deployment select local` for an existing one.
 */
export function planConvexDev(
  options: { local?: boolean },
  needsProvisioning: boolean,
  projectName: string,
): { selectLocalFirst: boolean; devArgs: string[] } {
  const devArgs = ["convex", "dev", "--once", "--tail-logs", "disable"];
  if (needsProvisioning) {
    devArgs.push("--configure", "new", "--project", projectName);
    devArgs.push("--dev-deployment", options.local ? "local" : "cloud");
  }
  return { selectLocalFirst: !!options.local && !needsProvisioning, devArgs };
}

export async function runConvex(options: ConvexOptions): Promise<number> {
  section("Convex deployment");

  try {
    const tokenStatus = await checkToken();
    if (tokenStatus !== "valid") {
      yep(
        tokenStatus === "no-token" ? "not signed in to Convex" : "Convex token expired or revoked",
      );
      await helpAndWait({
        body: "Sign in (or refresh) with `npx convex login` in another terminal:",
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

    const plan = planConvexDev(options, needsProvisioning, projectName);
    if (plan.selectLocalFirst) {
      const sel = spawn([dlx(), "convex", "deployment", "select", "local"], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      if ((await sel.exited) !== 0) {
        bad("convex deployment select local failed");
        return 1;
      }
    }
    const cmd = [dlx(), ...plan.devArgs];

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
      const resolved = resolveTeamIdInput(raw, fromConfig);
      if (resolved.kind === "skip") {
        yep("EXPO_PUBLIC_APPLE_TEAM_ID not set (optional for lite; `vexpo full` asks again)");
      } else if (resolved.kind === "invalid") {
        throw new Error(
          `invalid Apple Team id '${resolved.value}' (must be 10 uppercase alphanumeric)`,
        );
      } else {
        teamId = resolved.value;
        await ensureLine("EXPO_PUBLIC_APPLE_TEAM_ID", teamId);
        ok(`wrote EXPO_PUBLIC_APPLE_TEAM_ID=${teamId}`);
      }
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
