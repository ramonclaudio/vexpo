import { runBetterAuth } from "./better-auth.ts";
import { runConvex } from "./convex.ts";
import { deploymentSlug, envMap, recordedOrDerivedDeployment } from "../lib/convex-env.ts";
import {
  deploymentsOfType,
  describeDeployment,
  listProjectDeployments,
} from "../lib/convex-management.ts";
import { envList, resolveProjectId } from "../lib/eas-project.ts";
import { ensureLine, readAll } from "../lib/env-local.ts";
import { BOLD, DIM, RESET, bad, line, nop, note, ok, section, yep } from "../lib/output.ts";

type AdoptOptions = {
  skipDevSteps?: boolean;
};

type RunbookState = {
  devSlug: string;
  hasResend: boolean;
  hasApple: boolean;
  hasProd: boolean;
  hasEasProdUrl: boolean;
};

function buildFinishRunbook(s: RunbookState): Array<{ cmd: string; desc: string }> {
  const steps: Array<{ cmd: string; desc: string }> = [];
  if (!s.hasResend) {
    steps.push({ cmd: "vexpo resend", desc: "create the dev sending key and webhook" });
  }
  if (!s.hasApple) {
    steps.push({
      cmd: "vexpo apple jwt",
      desc: "sign the Sign in with Apple JWT (or --copy-from <old>)",
    });
    steps.push({ cmd: "vexpo asc connect", desc: "link EAS to App Store Connect for submit" });
  }
  if (!s.hasProd) {
    steps.push({
      cmd: "CONVEX_DEPLOY_KEY= npx convex deploy",
      desc: "create the prod deployment (the empty key makes convex deploy target prod)",
    });
  }
  steps.push({
    cmd: `vexpo convex migrate --from ${s.devSlug} --prod`,
    desc: "copy the server-side env onto prod",
  });
  if (!s.hasEasProdUrl) {
    steps.push({ cmd: "vexpo full", desc: "push the prod EAS env" });
  }
  steps.push({ cmd: "vexpo doctor --channel prod", desc: "check the whole chain" });
  return steps;
}

async function reportDeployments(devSlug: string): Promise<string | undefined> {
  const deployments = await listProjectDeployments(devSlug);
  if (!deployments) {
    nop("couldn't list the project's deployments (offline or not logged in)");
    return undefined;
  }
  line();
  note("project deployments:");
  for (const d of deployments) {
    const mine = d.name === devSlug ? `  ${DIM}← .env.local${RESET}` : "";
    note(`  ${describeDeployment(d)} ${DIM}[${d.deploymentType}]${RESET}${mine}`);
  }
  const devs = deploymentsOfType(deployments, "dev");
  if (devs.length > 1) {
    yep(`${devs.length} dev deployments. keep one and delete the rest in the Convex dashboard`);
  }
  return deploymentsOfType(deployments, "prod")[0]?.name;
}

async function runDevSteps(): Promise<number> {
  line();
  const code = await runConvex({});
  if (code !== 0) return code;

  const devEnv = (await envMap()) ?? new Map<string, string>();
  if (devEnv.has("BETTER_AUTH_SECRET")) {
    nop("BETTER_AUTH_SECRET already set on the dev deployment");
    return 0;
  }
  return runBetterAuth({});
}

export async function runAdopt(options: AdoptOptions): Promise<number> {
  section("Adopt");

  const localEnv = await readAll();
  const deploymentRef = await recordedOrDerivedDeployment(localEnv, async (ref) => {
    await ensureLine("CONVEX_DEPLOYMENT", ref);
    ok(`derived CONVEX_DEPLOYMENT=${ref} from CONVEX_DEPLOY_KEY`);
  });
  if (!deploymentRef) {
    bad("no CONVEX_DEPLOYMENT in .env.local, and no dev deploy key to derive it from");
    note("run `eas integrations:convex:connect` first, or `vexpo full` to start from scratch");
    return 1;
  }
  const devSlug = deploymentSlug(deploymentRef);
  if (!devSlug) {
    bad(`could not parse a deployment slug from CONVEX_DEPLOYMENT=${deploymentRef}`);
    return 1;
  }
  ok(`adopting Convex deployment: ${BOLD}${devSlug}${RESET}`);

  const prodSlug = await reportDeployments(devSlug);

  if (!options.skipDevSteps) {
    const code = await runDevSteps();
    if (code !== 0) return code;
  }

  const devEnv = (await envMap()) ?? new Map<string, string>();
  const projectId = await resolveProjectId();
  const easProd = projectId ? await envList("production") : null;

  const steps = buildFinishRunbook({
    devSlug,
    hasResend: devEnv.has("RESEND_API_KEY"),
    hasApple: devEnv.has("APPLE_CLIENT_SECRET"),
    hasProd: !!prodSlug,
    hasEasProdUrl: !!easProd?.has("EXPO_PUBLIC_CONVEX_URL"),
  });

  line();
  section("Finish");
  note("dev deployment adopted. left to run, in order:");
  const width = Math.max(...steps.map((s) => s.cmd.length));
  for (const s of steps) note(`  ${BOLD}${s.cmd.padEnd(width)}${RESET}  ${DIM}${s.desc}${RESET}`);
  line();
  nop("these need credentials or prompts, so they're listed instead of run");
  return 0;
}
