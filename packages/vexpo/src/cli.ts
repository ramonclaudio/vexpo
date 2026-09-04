import { Command } from "commander";

import pkg from "../package.json" with { type: "json" };
import { runAccounts } from "./commands/accounts.ts";
import { runAdopt } from "./commands/adopt.ts";
import { runAppleCredentials } from "./commands/apple/credentials.ts";
import { runAppleJwt } from "./commands/apple/jwt.ts";
import { runAscKey } from "./commands/apple/asc-key.ts";
import { runEasRotationSecrets } from "./commands/apple/eas-rotation-secrets.ts";
import { runServicesId } from "./commands/apple/services-id.ts";
import { runAscConnect } from "./commands/asc.ts";
import { runAccessibilityLint, runAccessibilityShow } from "./commands/asc-accessibility.ts";
import { runPrivacyLint, runPrivacyShow } from "./commands/asc-privacy.ts";
import {
  runTestflightGroupsCreate,
  runTestflightGroupsDelete,
  runTestflightCrashes,
  runTestflightFeedback,
  runTestflightGroupsList,
  runTestflightGroupsView,
  runTestflightInvite,
  runTestflightTestersList,
  runTestflightWhatsNew,
} from "./commands/testflight.ts";
import { runBetterAuth } from "./commands/better-auth.ts";
import { runConvex } from "./commands/convex.ts";
import { runConvexMigrate } from "./commands/convex-migrate.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runConvexKey } from "./commands/env/convex-key.ts";
import { runEnvPush } from "./commands/env/push.ts";
import { runRebrand } from "./commands/rebrand.ts";
import { runResend } from "./commands/resend.ts";
import { runReviewAccount } from "./commands/review-account.ts";
import { runSetup } from "./commands/setup.ts";
import { runSubmit } from "./commands/submit.ts";
import { bad, errText } from "./lib/output.ts";

const program = new Command()
  .name("vexpo")
  .description("CLI for vexpo projects (Expo + Convex + Better Auth + Resend).")
  .version(pkg.version, "-v, --version");

const exitWith = (p: Promise<number>): void => {
  p.then((code) => process.exit(code)).catch((err) => {
    bad(errText(err));
    process.exit(1);
  });
};

program
  .command("lite")
  .description(
    "Dev-mode setup. Provisions Convex and Better Auth only. The first `npm run ios` native build takes a few minutes on top. No Apple Developer account, no domain, no EAS, no Resend. Sign-up auto-verifies (no OTP). Re-run `vexpo full` later to provision the rest.",
  )
  .option("--new", "walk Convex signup before provisioning", false)
  .option("--force", "re-run every step, ignoring the cache", false)
  .option("--fresh", "wipe state and reprovision Convex from scratch", false)
  .option("--local", "self-hosted Convex backend", false)
  .option("--dry-run", "print what each phase would do, exit without changes", false)
  .option("--plan", "print the full setup journey upfront, exit without changes", false)
  .option("--no-state", "ignore .setup-state.json (CI-friendly)")
  .action(
    (options: {
      new?: boolean;
      force?: boolean;
      fresh?: boolean;
      local?: boolean;
      dryRun?: boolean;
      plan?: boolean;
      state?: boolean;
    }) => {
      exitWith(
        runSetup({
          lite: true,
          isNew: options.new,
          force: options.force,
          fresh: options.fresh,
          local: options.local,
          dryRun: options.dryRun,
          plan: options.plan,
          noState: options.state === false,
        }),
      );
    },
  );

program
  .command("full")
  .description(
    "Provisions Convex, Better Auth, Resend, Apple Sign In, the ASC API key, EAS init, and rebrand. Assumes you already have Apple, Convex, Expo and Resend accounts and API keys. Pass `--new` to walk every signup first. On completion, prints the `eas build` command to run when you're ready. vexpo doesn't invoke `eas build` itself.",
  )
  .option("--new", "walk Apple, Convex, Expo and Resend signups before provisioning", false)
  .option("--force", "re-run every step, ignoring the cache", false)
  .option("--fresh", "wipe state and reprovision Convex from scratch", false)
  .option("--local", "self-hosted Convex backend", false)
  .option("--dry-run", "print what each phase would do, exit without changes", false)
  .option("--plan", "print the full setup journey upfront, exit without changes", false)
  .option("--no-state", "ignore .setup-state.json (CI-friendly)")
  .option("--skip-rebrand", "skip the rebrand wizard (useful if you've already rebranded)", false)
  .action(
    (options: {
      new?: boolean;
      force?: boolean;
      fresh?: boolean;
      local?: boolean;
      dryRun?: boolean;
      plan?: boolean;
      state?: boolean;
      skipRebrand?: boolean;
    }) => {
      exitWith(
        runSetup({
          lite: false,
          isNew: options.new,
          force: options.force,
          fresh: options.fresh,
          local: options.local,
          dryRun: options.dryRun,
          plan: options.plan,
          noState: options.state === false,
          skipRebrand: options.skipRebrand,
        }),
      );
    },
  );

program
  .command("accounts")
  .description(
    "Walk Apple, Expo, Convex and Resend signups plus auth checks. Skips accounts already signed in.",
  )
  .option("--check", "check only, exit non-zero on missing", false)
  .action((options: { check?: boolean }) => {
    exitWith(runAccounts(options));
  });

program
  .command("rebrand")
  .description("Replace template defaults with your fork's identity.")
  .option("--force", "re-run even if state says done", false)
  .option("-y, --yes", "accept derived defaults silently", false)
  .option("--app-name <name>", "your app's display name")
  .option("--bundle-id <id>", "iOS bundle id (e.g. com.you.app)")
  .option("--package-name <name>", "package.json name")
  .option("--scheme <scheme>", "url scheme")
  .option("--owner-name <name>", "your full name")
  .option("--expo-owner <slug>", "Expo team slug")
  .option("--review-email <email>", "ASC review contact email")
  .option("--review-phone <phone>", "ASC review contact phone")
  .option("--marketing-url <url>", "marketing URL")
  .option("--support-url <url>", "support URL")
  .option("--privacy-url <url>", "privacy URL")
  .option("--copyright <line>", "copyright line")
  .action((options) => exitWith(runRebrand(options)));

program
  .command("review-account")
  .description(
    "Seed the App Review demo account on dev + prod Convex. Generates a password when store.config.json still has the placeholder (and writes it back), and rotates an existing account's password so the file and the deployments never drift.",
  )
  .option("--email <email>", "override demo email")
  .option("--password <password>", "override demo password")
  .option("--name <name>", "override demo display name", "App Review")
  .option("--username <username>", "optional username")
  .action((options) => exitWith(runReviewAccount(options)));

program
  .command("doctor")
  .description(
    "Cross-source drift detection. Auth-checks every credential, confirms IDs match across `.env.local`, Convex env, EAS env, `app.config.ts`. No eas-cli equivalent.",
  )
  .option("--channel <channel>", "dev | prod", "dev")
  .option("--json", "machine-readable output", false)
  .option("--strict", "exit non-zero on any warn", false)
  .action((options: { channel?: string; json?: boolean; strict?: boolean }) => {
    exitWith(runDoctor(options));
  });

program
  .command("adopt")
  .description(
    "Finish a project created by `eas integrations:convex:connect`. Adopts the existing dev deployment (never a fresh one), backfills site URLs + Better Auth, reports the deployment topology (flagging a duplicate dev deployment), and prints the exact commands left to finish.",
  )
  .option("--skip-dev-steps", "report topology + runbook only, don't run convex/better-auth", false)
  .action((options: { skipDevSteps?: boolean }) => exitWith(runAdopt(options)));

const convex = program
  .command("convex")
  .description("Provision or connect a Convex deployment.")
  .option("--fresh", "provision a NEW deployment", false)
  .option("--local", "self-hosted or local backend", false)
  .option("--name <name>", "override Convex project name")
  .action((options: { fresh?: boolean; local?: boolean; name?: string }) =>
    exitWith(runConvex(options)),
  );

convex
  .command("migrate")
  .description(
    "Copy server-side Convex env (BETTER_AUTH_SECRET, RESEND_*, APPLE_*, APP_*, ...) from another deployment onto the current one. The piece a deployment migration can't get off disk. CONVEX_* are left untouched.",
  )
  .requiredOption("--from <deployment>", "source deployment slug to copy env from")
  .option("--prod", "target the prod deployment (reads prod creds from .env.prod)")
  .option("--dry-run", "show what would be copied, exit without changes", false)
  .action((options: { from: string; prod?: boolean; dryRun?: boolean }) =>
    exitWith(runConvexMigrate(options)),
  );

program
  .command("better-auth")
  .description("Set SITE_URL, BETTER_AUTH_SECRET, APP_NAME on Convex.")
  .option("--rotate-secret", "regenerate BETTER_AUTH_SECRET", false)
  .option("--site-url <url>", "override SITE_URL")
  .option("--app-name <name>", "override APP_NAME")
  .action((options: { rotateSecret?: boolean; siteUrl?: string; appName?: string }) =>
    exitWith(runBetterAuth(options)),
  );

program
  .command("resend")
  .description("Provision Resend sending key + webhook, write to Convex env.")
  .option("--name <name>", "override sending key name")
  .option("--from <address>", "override EMAIL_FROM")
  .option(
    "--repoint",
    "move the webhook to the current convex.site + realign the secret, without rotating the sending key or changing auth policy",
  )
  .option(
    "--prod",
    "with --repoint, target the prod deployment + .env.prod site URL (the full flow wires both channels itself)",
  )
  .option(
    "--force",
    "with --repoint, recreate the webhook even if it already points at the endpoint",
  )
  .action(
    (options: {
      name?: string;
      from?: string;
      repoint?: boolean;
      prod?: boolean;
      force?: boolean;
    }) => exitWith(runResend(options)),
  );

const apple = program.command("apple").description("Apple-side provisioning.");

apple
  .command("asc-key")
  .description("Validate an App Store Connect API key against `/v1/apps`. No eas-cli equivalent.")
  .option("--revalidate", "re-check the cached key still works", false)
  .action((options: { revalidate?: boolean }) => exitWith(runAscKey(options)));

apple
  .command("services-id")
  .description(
    "Detect SIWA Services ID via ASC API + attach `APPLE_ID_AUTH` capability. Walks the user through manual creation in the Apple Developer Portal if missing (Apple removed the create-via-API path in 2025). No eas-cli equivalent.",
  )
  .option("--services-id <id>", "override Services ID")
  .option(
    "--bundle-id <id>",
    "register a bundle id other than .env.local's, e.g. <id>.dev for the development variant",
  )
  .action((options: { servicesId?: string; bundleId?: string }) =>
    exitWith(runServicesId(options)),
  );

apple
  .command("jwt")
  .description(
    "Sign the Sign In with Apple ES256 client_secret JWT (180-day expiry, Apple's max). Quarterly auto-rotation runs as an EAS Workflow cron. No eas-cli equivalent.",
  )
  .option("--rotate", "re-sign the JWT only", false)
  .option(
    "--copy-from <deployment>",
    "copy APPLE_* env from another deployment (slug) instead of signing, no .p8 needed",
  )
  .action((options: { rotate?: boolean; copyFrom?: string }) => exitWith(runAppleJwt(options)));

apple
  .command("credentials")
  .description(
    "Provision iOS build credentials by wrapping `eas credentials:configure-build` with the cached ASC API key passed via env vars (skips the Apple Developer login prompt in the wizard). EAS generates the dist cert + provisioning profile + push key.",
  )
  .option("-e, --profile <name>", "build profile", "production")
  .action((options: { profile?: string }) => exitWith(runAppleCredentials(options)));

apple
  .command("eas-rotation-secrets")
  .description(
    "Push the 5 EAS production secrets the SIWA JWT rotation cron needs (`APPLE_P8_PRIVATE_KEY`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_SERVICES_ID`, `CONVEX_DEPLOY_KEY`).",
  )
  .option("--force", "overwrite existing values", false)
  .action((options: { force?: boolean }) => exitWith(runEasRotationSecrets(options)));

const env = program
  .command("env")
  .description("Multi-destination env sync (Convex + EAS together).");

env
  .command("push")
  .description(
    "Read .env.local + .env.prod, push to Convex + EAS env. Lite-mode setup for projects that provision out-of-band.",
  )
  .option("--force", "overwrite without prompting", false)
  .option("--dry-run", "show plan, don't apply", false)
  .option("--no-verify", "skip post-sync verification")
  .option("--strict", "fail on warnings", false)
  .option("--local-file <path>", "override .env.local path")
  .option("--prod-file <path>", "override .env.prod path")
  .action(
    (options: {
      force?: boolean;
      dryRun?: boolean;
      verify?: boolean;
      strict?: boolean;
      localFile?: string;
      prodFile?: string;
    }) => {
      exitWith(
        runEnvPush({
          force: options.force,
          dryRun: options.dryRun,
          noVerify: options.verify === false,
          strict: options.strict,
          localFile: options.localFile,
          prodFile: options.prodFile,
        }),
      );
    },
  );

env
  .command("convex-key")
  .description(
    "Sync the Convex deploy key + deployment selector to EAS env (dev → development, prod → production/preview). Fixes a stale EAS deploy key after a deployment migration. Env push skips these on purpose.",
  )
  .option("--dev-key <key>", "dev deploy key (default: CONVEX_DEPLOY_KEY in .env.local)")
  .option("--prod-key <key>", "prod deploy key (default: CONVEX_DEPLOY_KEY in .env.prod)")
  .option("--mint", "mint the prod deploy key via the Platform API if EAS lacks one", false)
  .option("--local-file <path>", "override .env.local path")
  .option("--prod-file <path>", "override .env.prod path")
  .action(
    (options: {
      devKey?: string;
      prodKey?: string;
      mint?: boolean;
      localFile?: string;
      prodFile?: string;
    }) =>
      exitWith(
        runConvexKey({
          devKey: options.devKey,
          prodKey: options.prodKey,
          mint: options.mint,
          localFile: options.localFile,
          prodFile: options.prodFile,
        }),
      ),
  );

const asc = program.command("asc").description("App Store Connect: link + required labels.");

asc
  .command("connect")
  .description(
    "Write the project's ascAppId into eas.json and link the EAS project to its App Store Connect app. Lands the ascAppId even headless (CI). The interactive EAS↔ASC link (wraps `eas integrations:asc:connect`) needs a terminal.",
  )
  .option("--force", "re-run even if already connected", false)
  .action((options: { force?: boolean }) => exitWith(runAscConnect(options)));

program
  .command("submit")
  .description(
    "Submit a finished iOS build non-interactively (TestFlight by default). Sets EXPO_ASC_* from the cached ASC key and writes ascAppId into eas.json, then runs `eas submit --latest`. No EAS credential store needed.",
  )
  .option("--profile <name>", "eas.json submit profile", "testflight")
  .option("--id <buildId>", "submit a specific build id (default: the latest finished build)")
  .action((options: { profile?: string; id?: string }) =>
    exitWith(runSubmit({ profile: options.profile, id: options.id })),
  );

const ascPrivacy = asc.command("privacy").description("Privacy nutrition labels (local).");

ascPrivacy
  .command("show [file]")
  .description("Show the declared privacy.config.json (Apple has no live read API, set it in ASC).")
  .option("--json", "JSON output", false)
  .action((file: string | undefined, options: { json?: boolean }) =>
    exitWith(runPrivacyShow(file ?? "app-store/privacy.config.json", options)),
  );

ascPrivacy
  .command("lint <file>")
  .description("Validate a local privacy.config.json against Apple's enums.")
  .action((file: string) => exitWith(runPrivacyLint(file)));

const ascA11y = asc
  .command("accessibility")
  .description("Accessibility nutrition labels (iOS 26+).");

ascA11y
  .command("show")
  .description("Fetch the app's current accessibility declarations.")
  .option("--json", "JSON output", false)
  .action((options: { json?: boolean }) => exitWith(runAccessibilityShow(options)));

ascA11y
  .command("lint <file>")
  .description("Validate a local accessibility.config.json against Apple's enums.")
  .action((file: string) => exitWith(runAccessibilityLint(file)));

const testflight = program
  .command("testflight")
  .description("TestFlight beta groups + testers via ASC API.");

const tfGroups = testflight.command("groups").description("Beta groups.");

tfGroups
  .command("list")
  .description("List beta groups for the current app.")
  .option("--json", "JSON output", false)
  .action((options: { json?: boolean }) => exitWith(runTestflightGroupsList(options)));

tfGroups
  .command("create <name>")
  .description("Create a beta group.")
  .option("--feedback", "enable in-app feedback", false)
  .action((name: string, options: { feedback?: boolean }) =>
    exitWith(runTestflightGroupsCreate({ name, feedback: options.feedback })),
  );

tfGroups
  .command("view <id>")
  .description("View a beta group + its testers.")
  .option("--json", "JSON output", false)
  .action((id: string, options: { json?: boolean }) =>
    exitWith(runTestflightGroupsView(id, options)),
  );

tfGroups
  .command("delete <id>")
  .description("Delete a beta group.")
  .action((id: string) => exitWith(runTestflightGroupsDelete(id)));

const tfTesters = testflight.command("testers").description("Beta testers.");

tfTesters
  .command("list")
  .description("List beta testers.")
  .option("--email <email>", "filter by email")
  .option("--json", "JSON output", false)
  .action((options) => exitWith(runTestflightTestersList(options)));

testflight
  .command("invite <email>")
  .description("Add a tester + send a TestFlight invite.")
  .option("--first-name <name>")
  .option("--last-name <name>")
  .option("--group <id>", "beta group ID to add the tester to")
  .action((email: string, options: { firstName?: string; lastName?: string; group?: string }) =>
    exitWith(
      runTestflightInvite({
        email,
        firstName: options.firstName,
        lastName: options.lastName,
        groupId: options.group,
      }),
    ),
  );

const feedbackAction =
  (run: (o: { limit: number; json?: boolean }) => Promise<number>) =>
  (options: { limit: string; json?: boolean }) =>
    exitWith(run({ limit: Number(options.limit), json: options.json }));

testflight
  .command("feedback")
  .description("Recent tester screenshot feedback, newest first.")
  .option("--limit <n>", "how many to show (max 200)", "20")
  .option("--json", "JSON output", false)
  .action(feedbackAction(runTestflightFeedback));

testflight
  .command("crashes")
  .description("Recent tester crash reports, newest first.")
  .option("--limit <n>", "how many to show (max 200)", "20")
  .option("--json", "JSON output", false)
  .action(feedbackAction(runTestflightCrashes));

testflight
  .command("whats-new <buildId> <text>")
  .description(
    'Set the "What\'s new" release notes for a TestFlight build. At submit time `eas submit --what-to-test` does this for the build it submits. Use this for a build that is already up, or for a locale other than en-US.',
  )
  .option("--locale <locale>", "ISO locale", "en-US")
  .action((buildId: string, text: string, options: { locale?: string }) =>
    exitWith(runTestflightWhatsNew({ buildId, locale: options.locale ?? "en-US", text })),
  );

program.parse();
