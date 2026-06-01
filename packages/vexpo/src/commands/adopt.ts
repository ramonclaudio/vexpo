/**
 * `vexpo adopt`. Finishes a Convex project that Expo's
 * `eas integrations:convex:connect` created. The integration makes the project +
 * dev deployment, writes .env.local, and sets EXPO_PUBLIC_CONVEX_URL on EAS, but
 * leaves the rest: the site URLs, server-side env, a prod deployment, and the
 * Apple/Resend/ASC legs. This adopts the EXISTING deployment (never a fresh
 * project), runs the safe idempotent dev steps, surfaces the deployment topology
 * (catching the duplicate dev deployment the integration tends to leave), and
 * prints the exact, tailored commands to finish.
 *
 * It deliberately does NOT run the prod / Apple / Resend legs automatically:
 * those need credentials + prompts and mutate prod, so they're emitted as a
 * runbook instead of fired blind.
 */

import { runBetterAuth } from "./better-auth.ts";
import { runConvex } from "./convex.ts";
import { deploymentSlug, envMap } from "../lib/convex-env.ts";
import {
  deploymentsOfType,
  describeDeployment,
  listProjectDeployments,
} from "../lib/convex-management.ts";
import { envList, resolveProjectId } from "../lib/eas-env.ts";
import { readOne } from "../lib/env-local.ts";
import { BOLD, DIM, RESET, bad, line, nop, note, ok, section, yep } from "../lib/output.ts";

export type AdoptOptions = {
  skipDevSteps?: boolean;
};

export type RunbookState = {
  devSlug: string;
  hasResend: boolean;
  hasApple: boolean;
  hasProd: boolean;
  hasEasProdUrl: boolean;
};

export function buildFinishRunbook(s: RunbookState): Array<{ cmd: string; desc: string }> {
  const steps: Array<{ cmd: string; desc: string }> = [];
  if (!s.hasResend) {
    steps.push({ cmd: "vexpo resend", desc: "provision the dev sending key + webhook" });
  }
  if (!s.hasApple) {
    steps.push({ cmd: "vexpo apple jwt", desc: "sign Apple Sign In (or --copy-from <old>)" });
    steps.push({ cmd: "vexpo asc:connect", desc: "link EAS to App Store Connect for submit" });
  }
  if (!s.hasProd) {
    steps.push({ cmd: "npx convex deploy", desc: "provision + push to the prod deployment" });
  }
  steps.push({
    cmd: `vexpo convex:migrate --from ${s.devSlug} --prod`,
    desc: "mirror server-side env onto prod",
  });
  steps.push({ cmd: "vexpo env convex-key", desc: "sync the deploy key + selector to EAS" });
  if (!s.hasEasProdUrl) {
    steps.push({ cmd: "vexpo full", desc: "push prod/preview EAS env (or `vexpo eas`)" });
  }
  steps.push({ cmd: "vexpo doctor --channel prod", desc: "verify the whole chain" });
  return steps;
}

export async function runAdopt(options: AdoptOptions): Promise<number> {
  section("Adopt");

  const deploymentRef = await readOne("CONVEX_DEPLOYMENT");
  if (!deploymentRef) {
    bad("no CONVEX_DEPLOYMENT in .env.local. nothing to adopt");
    note("run `eas integrations:convex:connect` first, or `vexpo full` to provision from scratch");
    return 1;
  }
  const devSlug = deploymentSlug(deploymentRef);
  if (!devSlug) {
    bad(`could not parse a deployment slug from CONVEX_DEPLOYMENT=${deploymentRef}`);
    return 1;
  }
  ok(`adopting Convex deployment: ${BOLD}${devSlug}${RESET}`);

  const deployments = await listProjectDeployments(devSlug);
  let prodSlug: string | undefined;
  if (deployments) {
    line();
    note("project deployments:");
    for (const d of deployments) {
      const mine = d.name === devSlug ? `  ${DIM}← .env.local${RESET}` : "";
      note(`  ${describeDeployment(d)} ${DIM}[${d.deploymentType}]${RESET}${mine}`);
    }
    const devs = deploymentsOfType(deployments, "dev");
    if (devs.length > 1) {
      yep(
        `${devs.length} dev deployments; pick one canonical and delete the rest in the dashboard`,
      );
    }
    prodSlug = deploymentsOfType(deployments, "prod")[0]?.name;
  } else {
    nop("deployment enumeration unavailable (offline or not logged in); continuing");
  }

  if (!options.skipDevSteps) {
    line();
    const code = await runConvex({});
    if (code !== 0) return code;

    const devEnv = await envMap();
    if (!devEnv.has("BETTER_AUTH_SECRET")) {
      const baCode = await runBetterAuth({});
      if (baCode !== 0) return baCode;
    } else {
      nop("BETTER_AUTH_SECRET already set on the dev deployment");
    }
  }

  const devEnv = await envMap();
  const projectId = await resolveProjectId();
  const easProd = projectId ? await envList("production").catch(() => null) : null;

  const steps = buildFinishRunbook({
    devSlug,
    hasResend: devEnv.has("RESEND_API_KEY"),
    hasApple: devEnv.has("APPLE_CLIENT_SECRET"),
    hasProd: !!prodSlug,
    hasEasProdUrl: !!easProd?.has("EXPO_PUBLIC_CONVEX_URL"),
  });

  line();
  section("Finish");
  note("adopted the dev deployment. remaining, in order:");
  const width = Math.max(...steps.map((s) => s.cmd.length));
  for (const s of steps) note(`  ${BOLD}${s.cmd.padEnd(width)}${RESET}  ${DIM}${s.desc}${RESET}`);
  line();
  nop("prod + Apple + Resend legs need credentials/prompts, so they're listed, not auto-run");
  return 0;
}
