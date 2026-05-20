/**
 * `vexpo eas`. bridge to eas-cli. Just delegates: `eas init` then
 * `eas env:push --path .env.local --environment <each>`. Nothing fancy.
 *
 * Why this exists: the orchestrator wants one entry point for "wire up EAS"
 * and we record the projectId in `.setup-state.json` so the probe knows EAS
 * is set up without re-shelling. If you'd rather skip the wrapper:
 *
 *     bunx eas init
 *     bunx eas env:push --path .env.local --environment development --force
 *     bunx eas env:push --path .env.prod  --environment production --force
 *     bunx eas env:push --path .env.prod  --environment preview    --force
 *
 * What we explicitly do NOT do:
 *   - iOS dist cert / profile / push key / ASC API key upload  → eas credentials
 *   - capability sync from ios.entitlements                    → eas build
 *   - ASC app record creation                                  → eas submit (first run)
 *   - OTA branches/channels                                    → eas update / eas branch
 */

import { access } from "node:fs/promises";

import {
  checkCli,
  ensureBranches,
  ensureChannels,
  envPush,
  init,
  resolveProjectId,
  whoami,
} from "../lib/eas-env.ts";
import { BOLD, RESET, askYesNo, bad, line, nop, note, ok, section, yep } from "../lib/output.ts";
import { dlx } from "../lib/pkg-manager.ts";
import { spawn } from "../lib/proc.ts";
import { recordStep } from "../lib/state.ts";

export type EasOptions = {
  skipEnv?: boolean;
  skipInit?: boolean;
  withProd?: boolean;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function runEas(options: EasOptions): Promise<number> {
  section("EAS");

  try {
    const cli = await checkCli();
    if (!cli.ok) {
      bad("eas CLI not available. install with `bun add -g eas-cli`");
      return 1;
    }
    ok(`eas-cli ${cli.version}`);

    const who = await whoami();
    if (!who) {
      if (!process.stdin.isTTY) {
        bad("non-TTY: run `bunx eas login` then re-run");
        return 1;
      }
      yep("not signed in to Expo");
      if (!(await askYesNo("Run `eas login` now?", true))) {
        bad("aborted");
        return 1;
      }
      const proc = spawn([dlx(), "eas", "login"], {
        stdio: ["inherit", "inherit", "inherit"],
      });
      if ((await proc.exited) !== 0) {
        bad("eas login did not complete");
        return 1;
      }
    } else {
      ok(`signed in as ${BOLD}${who}${RESET}`);
    }

    let projectId = await resolveProjectId();
    if (!options.skipInit) {
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

      // Pre-create channels + branches the workflows reference. eas-cli
      // auto-creates them lazily on first `eas update`, but pre-creating
      // means dashboards / `eas channel:list` show the expected names from
      // day one and workflows never hit "channel not found" on a cold project.
      const channels = ["development", "preview", "production"];
      const createdChannels = await ensureChannels(channels);
      if (createdChannels.length > 0) ok(`channels created: ${createdChannels.join(", ")}`);
      else nop(`channels already exist (${channels.join(", ")})`);

      const branches = ["development", "preview", "production"];
      const createdBranches = await ensureBranches(branches);
      if (createdBranches.length > 0) ok(`branches created: ${createdBranches.join(", ")}`);
      else nop(`branches already exist (${branches.join(", ")})`);
    }
    // The template's eas.json already wires channels onto the parent build
    // profiles (development / preview / production), and extending profiles
    // inherit. `eas update:configure` is therefore a no-op here. If you need
    // to re-wire on a project that lost its channel fields, run
    // `vexpo update:configure` manually.

    if (!options.skipEnv) {
      if (await fileExists(".env.local")) {
        try {
          await envPush({ path: ".env.local", environments: ["development"], force: true });
          ok(`pushed .env.local → EAS env (development)`);
        } catch (err) {
          bad(err instanceof Error ? err.message : String(err));
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
            await envPush({
              path: prodFile,
              environments: ["production", "preview"],
              force: true,
            });
            ok(`pushed ${prodFile} → EAS env (production, preview)`);
          } catch (err) {
            bad(err instanceof Error ? err.message : String(err));
          }
        } else {
          nop("--with-prod set but no .env.prod or .env.production found");
        }
      }
    }

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
      `  ${BOLD}bunx eas credentials -p ios${RESET}     dist cert + profile + push key + ASC API key`,
    );
    note(`  ${BOLD}bunx eas build -p ios --profile production${RESET}`);
    note(
      `  ${BOLD}bunx eas submit -p ios --profile production${RESET}  (auto-creates App Store record)`,
    );
    note(`  ${BOLD}bunx eas metadata:push${RESET}          push store.config.json`);
    note(
      `  ${BOLD}bunx eas workflow:run .eas/workflows/<file>${RESET}  trigger a workflow locally`,
    );
    line();
    note(`${BOLD}Stack-specific (ours, not eas-cli's)${RESET}`);
    note(`  ${BOLD}vexpo apple asc-key${RESET}        validate ASC API key against /v1/apps`);
    note(`  ${BOLD}vexpo apple services-id${RESET}    create SIWA Services ID via ASC API`);
    note(`  ${BOLD}vexpo apple jwt${RESET}            sign the SIWA client_secret JWT`);
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
