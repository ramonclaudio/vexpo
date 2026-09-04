import { easSpawn } from "../lib/eas-cli.ts";
import {
  checkCli,
  ensureBranches,
  ensureChannels,
  envPush,
  init,
  resolveProjectId,
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

export type EasOptions = {
  withProd?: boolean;
};

async function pushEasRoutedKeys(
  file: string,
  environments: readonly EasEnvironment[],
): Promise<string[]> {
  const entries = await readEnvFile(file);
  const easKeys: Array<[string, string]> = [];
  for (const [key, value] of entries) {
    if (ROUTING[key]?.routes("dev").some((d) => d.type === "eas")) easKeys.push([key, value]);
  }
  if (easKeys.length === 0) return [];

  return withTempEnvFile(
    easKeys.map(([k, v]) => `${k}=${v}`),
    async (tmp) => {
      await envPush({ path: tmp, environments, force: true });
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
    bad("non-TTY: run `npx eas-cli login` then re-run");
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

async function ensureAll(
  label: string,
  names: string[],
  ensure: (names: string[]) => Promise<string[]>,
): Promise<void> {
  const created = await ensure(names);
  if (created.length > 0) ok(`${label} created: ${created.join(", ")}`);
  else nop(`${label} already exist (${names.join(", ")})`);
}

async function pushEnvFile(
  file: string,
  environments: readonly EasEnvironment[],
  emptyNote: string,
): Promise<boolean> {
  try {
    const pushed = await pushEasRoutedKeys(file, environments);
    if (pushed.length === 0) nop(emptyNote);
    else
      ok(
        `pushed ${pushed.length} EXPO_PUBLIC_* var${plural(pushed.length)} → EAS env (${environments.join(", ")})`,
      );
    return true;
  } catch (err) {
    bad(errText(err));
    return false;
  }
}

function printNextCommands(): void {
  line();
  note(`${BOLD}Next, eas-cli (we don't replace these)${RESET}`);
  note(
    `  ${BOLD}npx eas-cli credentials -p ios${RESET}     dist cert + profile + push key + ASC API key`,
  );
  note(`  ${BOLD}npx eas-cli build -p ios --profile production${RESET}`);
  note(
    `  ${BOLD}npx eas-cli submit -p ios --profile production${RESET}  (auto-creates App Store record)`,
  );
  note(`  ${BOLD}npx eas-cli metadata:push${RESET}          push store.config.json`);
  note(
    `  ${BOLD}npx eas-cli workflow:run .eas/workflows/<file>${RESET}  trigger a workflow locally`,
  );
  line();
  note(`${BOLD}Stack-specific (ours, not eas-cli's)${RESET}`);
  note(`  ${BOLD}vexpo apple asc-key${RESET}        validate ASC API key against /v1/apps`);
  note(`  ${BOLD}vexpo apple services-id${RESET}    create SIWA Services ID via ASC API`);
  note(`  ${BOLD}vexpo apple jwt${RESET}            sign the SIWA client_secret JWT`);
}

export async function runEas(options: EasOptions): Promise<number> {
  section("EAS");

  const cli = await checkCli();
  if (!cli.ok) {
    bad("eas CLI not available. install with `npm install -g eas-cli`");
    return 1;
  }
  ok(`eas-cli ${cli.version}`);

  const signedIn = await ensureSignedIn();
  if (!signedIn.ok) return 1;

  const project = await ensureProject();
  if (!project.ok) return 1;

  const stages = ["development", "preview", "production"];
  await ensureAll("channels", stages, ensureChannels);
  await ensureAll("branches", stages, ensureBranches);

  let pushFailed = false;

  if (await fileExists(".env.local")) {
    pushFailed = !(await pushEnvFile(
      ".env.local",
      ["development"],
      ".env.local has no EAS-routed keys yet (run `vexpo convex` first)",
    ));
  } else {
    nop(".env.local missing. skipping development env push (run `vexpo convex` first)");
  }

  if (options.withProd) {
    const prodFile = await findProdEnvFile();
    if (!prodFile) nop("--with-prod set but no .env.prod or .env.production found");
    else if (
      !(await pushEnvFile(
        prodFile,
        ["production", "preview"],
        `${prodFile} has no EAS-routed keys`,
      ))
    )
      pushFailed = true;
  }
  note(
    `server-side secrets route to Convex, not EAS. run ${BOLD}vexpo env push${RESET} to sync those`,
  );

  if (project.projectId) {
    await recordStep("eas", {
      projectId: project.projectId,
      signedInAs: signedIn.who,
      mirroredAt: new Date().toISOString(),
    });
  }

  printNextCommands();
  return pushFailed ? 1 : 0;
}
