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
import { ROUTING, readEnvFile, withTempEnvFile } from "../lib/env-files.ts";
import { fileExists } from "../lib/fs.ts";
import { BOLD, RESET, askYesNo, bad, line, nop, note, ok, section, yep } from "../lib/output.ts";
import { recordStep } from "../lib/state.ts";

export type EasOptions = {
  withProd?: boolean;
};

/**
 * Pushes ONLY the EAS-routed keys (the `EXPO_PUBLIC_*` vars) from an env file
 * to EAS. Server-side secrets (`BETTER_AUTH_SECRET`, `RESEND_API_KEY`,
 * `CONVEX_DEPLOY_KEY`, …) route to the Convex deployment per `env-files.ts`
 * and must never land on EAS at default Sensitive (locally-pullable)
 * visibility. The filtered subset is written to a 0600 temp file so the
 * plaintext never touches a predictable path. Returns the pushed key names.
 */
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

export async function runEas(options: EasOptions): Promise<number> {
  section("EAS");

  const cli = await checkCli();
  if (!cli.ok) {
    bad("eas CLI not available. install with `npm install -g eas-cli`");
    return 1;
  }
  ok(`eas-cli ${cli.version}`);

  const who = await whoami();
  if (!who) {
    if (!process.stdin.isTTY) {
      bad("non-TTY: run `npx eas-cli login` then re-run");
      return 1;
    }
    yep("not signed in to Expo");
    if (!(await askYesNo("Run `eas login` now?", true))) {
      bad("aborted");
      return 1;
    }
    if ((await easSpawn(["login"])) !== 0) {
      bad("eas login did not complete");
      return 1;
    }
  } else {
    ok(`signed in as ${BOLD}${who}${RESET}`);
  }

  let projectId = await resolveProjectId();
  if (projectId) {
    ok(`EAS project linked: ${projectId}`);
  } else {
    const result = await init();
    if (!result.ok) {
      bad("eas init failed");
      return 1;
    }
    projectId = result.projectId ?? null;
    ok(`EAS project created: ${projectId}`);
  }

  const channels = ["development", "preview", "production"];
  const createdChannels = await ensureChannels(channels);
  if (createdChannels.length > 0) ok(`channels created: ${createdChannels.join(", ")}`);
  else nop(`channels already exist (${channels.join(", ")})`);

  const branches = ["development", "preview", "production"];
  const createdBranches = await ensureBranches(branches);
  if (createdBranches.length > 0) ok(`branches created: ${createdBranches.join(", ")}`);
  else nop(`branches already exist (${branches.join(", ")})`);

  let pushFailed = false;

  if (await fileExists(".env.local")) {
    try {
      const pushed = await pushEasRoutedKeys(".env.local", ["development"]);
      if (pushed.length > 0) {
        ok(
          `pushed ${pushed.length} EXPO_PUBLIC_* var${pushed.length === 1 ? "" : "s"} → EAS env (development)`,
        );
      } else {
        nop(".env.local has no EAS-routed keys yet (run `vexpo convex` first)");
      }
    } catch (err) {
      bad(err instanceof Error ? err.message : String(err));
      pushFailed = true;
    }
  } else {
    nop(".env.local missing. skipping development env push (run `vexpo convex` first)");
  }

  if (options.withProd) {
    const prodFile = (await fileExists(".env.prod"))
      ? ".env.prod"
      : (await fileExists(".env.production"))
        ? ".env.production"
        : null;
    if (prodFile) {
      try {
        const pushed = await pushEasRoutedKeys(prodFile, ["production", "preview"]);
        if (pushed.length > 0) {
          ok(
            `pushed ${pushed.length} EXPO_PUBLIC_* var${pushed.length === 1 ? "" : "s"} → EAS env (production, preview)`,
          );
        } else {
          nop(`${prodFile} has no EAS-routed keys`);
        }
      } catch (err) {
        bad(err instanceof Error ? err.message : String(err));
        pushFailed = true;
      }
    } else {
      nop("--with-prod set but no .env.prod or .env.production found");
    }
  }
  note(
    `server-side secrets route to Convex, not EAS. run ${BOLD}vexpo env push${RESET} to sync those`,
  );

  if (projectId) {
    await recordStep("eas", {
      projectId,
      signedInAs: who,
      mirroredAt: new Date().toISOString(),
    });
  }

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
  return pushFailed ? 1 : 0;
}
