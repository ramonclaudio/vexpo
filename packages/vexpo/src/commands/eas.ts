import { easSpawn } from "../lib/eas-cli.ts";
import {
  ensureChannels,
  envPush,
  init,
  resolveProjectId,
  version as easVersion,
  whoami,
  type EasEnvironment,
} from "../lib/eas-project.ts";
import { ROUTING, findProdEnvFile, readEnvFile, withTempEnvFile } from "../lib/env-files.ts";
import { fileExists } from "../lib/fs.ts";
import {
  BOLD,
  RESET,
  askYesNo,
  bad,
  errText,
  line,
  nop,
  note,
  ok,
  plural,
  section,
  yep,
} from "../lib/output.ts";
import { recordStep } from "../lib/state.ts";

async function pushEasRoutedKeys(file: string, environment: EasEnvironment): Promise<string[]> {
  const entries = await readEnvFile(file);
  const easKeys: Array<[string, string]> = [];
  for (const [key, value] of entries) {
    if (ROUTING[key]?.type === "eas") easKeys.push([key, value]);
  }
  if (easKeys.length === 0) return [];

  return withTempEnvFile(
    easKeys.map(([k, v]) => `${k}=${v}`),
    async (tmp) => {
      await envPush({ path: tmp, environment, force: true });
      return easKeys.map(([k]) => k);
    },
  );
}

async function ensureSignedIn(): Promise<{ ok: boolean; who: string | null }> {
  const who = await whoami();
  if (who) {
    ok(`signed in as ${BOLD}${who}${RESET}`);
    return { ok: true, who };
  }
  if (!process.stdin.isTTY) {
    bad("no terminal to sign in from. run `npx eas-cli login`, then try again");
    return { ok: false, who: null };
  }
  yep("not signed in to Expo");
  if (!(await askYesNo("Run `eas login` now?", true))) {
    bad("aborted");
    return { ok: false, who: null };
  }
  if ((await easSpawn(["login"])) !== 0) {
    bad("eas login did not complete");
    return { ok: false, who: null };
  }
  return { ok: true, who: null };
}

async function ensureProject(): Promise<{ ok: boolean; projectId: string | null }> {
  const linked = await resolveProjectId();
  if (linked) {
    ok(`EAS project linked: ${linked}`);
    return { ok: true, projectId: linked };
  }
  const result = await init();
  if (!result.ok) {
    bad("eas init failed");
    return { ok: false, projectId: null };
  }
  const projectId = result.projectId ?? null;
  ok(`EAS project created: ${projectId}`);
  return { ok: true, projectId };
}

async function pushEnvFile(
  file: string,
  environment: EasEnvironment,
  emptyNote: string,
): Promise<boolean> {
  try {
    const pushed = await pushEasRoutedKeys(file, environment);
    if (pushed.length === 0) nop(emptyNote);
    else
      ok(
        `pushed ${pushed.length} EXPO_PUBLIC_* var${plural(pushed.length)} to the EAS ${environment} env`,
      );
    return true;
  } catch (err) {
    bad(errText(err));
    return false;
  }
}

function printNextCommands(): void {
  line();
  note(`${BOLD}Next${RESET}`);
  note(`  ${BOLD}vexpo apple asc-key${RESET}        validate the App Store Connect API key`);
  note(`  ${BOLD}vexpo apple credentials${RESET}    signing certificate and provisioning profile`);
  note(`  ${BOLD}vexpo apple services-id${RESET}    Sign in with Apple Services ID`);
  note(`  ${BOLD}vexpo apple jwt${RESET}            sign the Sign in with Apple JWT`);
  note(`  ${BOLD}CONVEX_DEPLOY_KEY= npx convex deploy${RESET}   push the backend to prod`);
  note(`  ${BOLD}npm run eas:tf${RESET}             build and submit to TestFlight`);
  note(`  ${BOLD}npm run metadata:push${RESET}      push store.config.json`);
}

export async function runEas(): Promise<number> {
  section("EAS");

  const cliVersion = await easVersion();
  if (!cliVersion) {
    bad("eas-cli not found. install it with `npm install -g eas-cli`");
    return 1;
  }
  ok(`eas-cli ${cliVersion}`);

  const signedIn = await ensureSignedIn();
  if (!signedIn.ok) return 1;

  const project = await ensureProject();
  if (!project.ok) return 1;

  const channels = ["development", "production"];
  const created = await ensureChannels(channels);
  if (created.length > 0) ok(`channels created: ${created.join(", ")}`);
  else nop(`channels already exist (${channels.join(", ")})`);

  let pushFailed = false;

  if (await fileExists(".env.local")) {
    pushFailed = !(await pushEnvFile(
      ".env.local",
      "development",
      ".env.local has no EAS keys yet (run `vexpo convex` first)",
    ));
  } else {
    nop("no .env.local, skipping the development env push (run `vexpo convex` first)");
  }

  const prodFile = await findProdEnvFile();
  if (!prodFile) nop("no .env.prod yet, so nothing went to the production env");
  else if (!(await pushEnvFile(prodFile, "production", `${prodFile} has no EAS keys`)))
    pushFailed = true;
  note(`server-side secrets go to Convex, not EAS. ${BOLD}vexpo env push${RESET} pushes those`);

  if (project.projectId) {
    await recordStep("eas", {
      projectId: project.projectId,
      signedInAs: signedIn.who,
      pushedAt: new Date().toISOString(),
    });
  }

  printNextCommands();
  return pushFailed ? 1 : 0;
}
