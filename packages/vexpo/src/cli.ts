// vexpo CLI surface. Deliberately small.
//
// Design principle: don't reinvent EAS. If `eas <subcommand>` already does
// the job, vexpo doesn't wrap it. Users should reach for `eas` for the
// canonical platform surface (init, build, update, submit, deploy, channel,
// branch, webhook, workflow, fingerprint, device, account, credentials,
// integrations:asc, etc.) and use `vexpo` only for the things `eas` doesn't do:
//
//   1. Setup orchestration (probe state, run missing phases, idempotency)
//   2. Cross-source drift detection (`vexpo doctor`)
//   3. Apple SIWA JWT signing + Services ID flow (no eas-cli equivalent)
//   4. ASC API endpoints eas-cli doesn't expose (TestFlight beta groups,
//      customer review responses, sandbox testers, version state)
//   5. Multi-destination env sync (Convex + EAS together)
//
// Everything else: use `npx eas <subcommand>` directly. The README
// documents the canonical eas-cli flow for build / update / submit /
// deploy / channel / branch / webhook / workflow / fingerprint / metadata
// / credentials / integrations:asc.

import { Command } from "commander";

import pkg from "../package.json" with { type: "json" };
import { runAccounts } from "./commands/accounts.ts";
import { runAppleCredentials } from "./commands/apple/credentials.ts";
import { runAppleJwt } from "./commands/apple/jwt.ts";
import { runAscKey } from "./commands/apple/asc-key.ts";
import { runEasRotationSecrets } from "./commands/apple/eas-rotation-secrets.ts";
import { runServicesId } from "./commands/apple/services-id.ts";
import { runAccessibilityLint, runAccessibilityShow } from "./commands/asc-accessibility.ts";
import { runPrivacyLint, runPrivacyShow } from "./commands/asc-privacy.ts";
import {
  runPhasedRelease,
  runSubmissionsList,
  runVersionList,
  runVersionView,
} from "./commands/asc-version.ts";
import {
  runReviewsDeleteResponse,
  runReviewsList,
  runReviewsRespond,
  runReviewsUnanswered,
} from "./commands/reviews.ts";
import { runSandboxCreate, runSandboxDelete, runSandboxList } from "./commands/sandbox.ts";
import {
  runTestflightGroupsCreate,
  runTestflightGroupsDelete,
  runTestflightGroupsList,
  runTestflightGroupsView,
  runTestflightInvite,
  runTestflightRemove,
  runTestflightTestersList,
  runTestflightWhatsNew,
} from "./commands/testflight.ts";
import { runBetterAuth } from "./commands/better-auth.ts";
import { runConvex } from "./commands/convex.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runEnvPush } from "./commands/env/push.ts";
import { runRebrand } from "./commands/rebrand.ts";
import { runResend } from "./commands/resend.ts";
import { runReviewAccount } from "./commands/review-account.ts";
import { runSetup } from "./commands/setup.ts";

const program = new Command()
  .name("vexpo")
  .description("Operational CLI for vexpo projects (Expo + Convex + Better Auth + Resend).")
  .version(pkg.version, "-v, --version");

const exitWith = (p: Promise<number>): void => {
  p.then((code) => process.exit(code)).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
};

/* ---------------------------------------------------------- lite / full --- */

// Two top-level setup commands:
//
//   vexpo lite          Convex + Better Auth only, 60-second simulator path.
//   vexpo lite --new    same, plus a Convex signup walkthrough for first-time users.
//   vexpo full          full provisioning: Convex + Better Auth + Resend + Apple
//                       Sign In + ASC API key + EAS init + rebrand. Does NOT
//                       auto-build to TestFlight, just provisions.
//   vexpo full --new    same, plus the Apple/Expo/Convex/Resend signup walkthrough
//                       for first-time users.
//
// After `vexpo full` completes, the user runs `eas build -p ios --profile
// production --auto-submit-with-profile testflight` to ship to TestFlight.
// vexpo does NOT invoke eas build itself.

program
  .command("lite")
  .description(
    "Dev-mode setup: Convex + Better Auth only. ~60 seconds from clone to the iOS Simulator. No Apple Developer account, no domain, no EAS, no Resend. Sign-up auto-verifies (no OTP). Re-run `vexpo full` later to provision the rest.",
  )
  .option("--new", "first-time user: walk Convex signup before provisioning", false)
  .option("--force", "re-run every step idempotently regardless of cache", false)
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
    "Full provisioning: Convex + Better Auth + Resend + Apple Sign In + ASC API key + EAS init + rebrand. Everything you need to ship to TestFlight. Default assumes you have Apple/Convex/Expo/Resend accounts + API keys; pass `--new` to walk every signup first. On completion, prints the `eas build` command to run when you're ready. vexpo doesn't invoke `eas build` itself.",
  )
  .option(
    "--new",
    "first-time user: walk Apple/Convex/Expo/Resend signups before provisioning",
    false,
  )
  .option("--force", "re-run every step idempotently regardless of cache", false)
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
  .description("Walk Apple/Expo/Convex/Resend signups + auth checks. Idempotent.")
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
  .description("Seed the App Review demo account on Convex.")
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
  .command("convex")
  .description("Provision or connect a Convex deployment.")
  .option("--fresh", "provision a NEW deployment", false)
  .option("--local", "self-hosted / local backend", false)
  .option("--name <name>", "override Convex project name")
  .action((options: { fresh?: boolean; local?: boolean; name?: string }) =>
    exitWith(runConvex(options)),
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
  .action((options: { name?: string; from?: string }) => exitWith(runResend(options)));

/* ---------------------------------------------------------------- apple --- */

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
  .action((options: { servicesId?: string }) => exitWith(runServicesId(options)));

apple
  .command("jwt")
  .description(
    "Sign the Sign In with Apple ES256 client_secret JWT (180-day expiry, Apple's max). Quarterly auto-rotation runs as an EAS Workflow cron. No eas-cli equivalent.",
  )
  .option("--rotate", "re-sign the JWT only", false)
  .action((options: { rotate?: boolean }) => exitWith(runAppleJwt(options)));

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

/* ------------------------------------------------------------------ env --- */

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

/* ------------------------------------------------------------------ asc --- */
// ASC API direct access for endpoints eas-cli doesn't expose: TestFlight
// beta groups + testers, customer review responses, sandbox testers, version
// state + phased rollout, privacy + accessibility nutrition labels. EAS's
// own `integrations:asc:*` topic is not surfaced as a public `vexpo`
// command; `vexpo full` orchestrates `eas integrations:asc:connect`
// internally by spawning it with EXPO_ASC_API_KEY_* env vars pre-set
// (same pattern `vexpo apple credentials` uses).

const ascVersion = program.command("asc:version").description("App Store version inspection.");

ascVersion
  .command("list")
  .description("List App Store versions.")
  .option("-p, --platform <p>", "IOS | MAC_OS | TV_OS | VISION_OS")
  .option("--state <state>", "filter by state (e.g. IN_REVIEW, READY_FOR_SALE)")
  .option("--limit <n>", "max items", (v) => parseInt(v, 10), 25)
  .option("--json", "JSON output", false)
  .action((options) => exitWith(runVersionList(options)));

ascVersion
  .command("view <versionId>")
  .description("View a single App Store version + phased-release state.")
  .option("--json", "JSON output", false)
  .action((versionId: string, options: { json?: boolean }) =>
    exitWith(runVersionView(versionId, options)),
  );

ascVersion
  .command("phased <versionId> <action>")
  .description("Pause | resume | complete the phased release for a version.")
  .action((versionId: string, action: string) => {
    if (!["pause", "resume", "complete"].includes(action)) {
      process.stderr.write(`unknown action '${action}' (pause|resume|complete)\n`);
      process.exit(2);
    }
    exitWith(
      runPhasedRelease({
        versionId,
        action: action as "pause" | "resume" | "complete",
      }),
    );
  });

program
  .command("asc:submissions")
  .description("List App Store review submissions for the current app.")
  .option("-p, --platform <p>", "IOS | MAC_OS | TV_OS | VISION_OS")
  .option("--state <state>", "filter by state")
  .option("--json", "JSON output", false)
  .action((options) => exitWith(runSubmissionsList(options)));

/* -------------------------------------------------------- asc:privacy --- */
// Privacy Nutrition Labels. Apple's API is read-only today; the lint
// validates a local `app-store/privacy.config.json` against the published
// data type + purpose enums so a stale label gets caught pre-submission.

const ascPrivacy = program.command("asc:privacy").description("Privacy nutrition labels.");

ascPrivacy
  .command("show")
  .description("Fetch the app's current privacy details from ASC.")
  .option("--json", "JSON output", false)
  .action((options: { json?: boolean }) => exitWith(runPrivacyShow(options)));

ascPrivacy
  .command("lint <file>")
  .description("Validate a local privacy.config.json against Apple's enums.")
  .action((file: string) => exitWith(runPrivacyLint(file)));

/* --------------------------------------------------- asc:accessibility --- */
// Accessibility Nutrition Labels (WWDC25, iOS 26+). Same shape as
// asc:privacy: show pulls current state, lint validates locals.

const ascA11y = program
  .command("asc:accessibility")
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

/* ----------------------------------------------------------- testflight --- */
// TestFlight beta groups + testers. eas-cli stops at upload; ASC API
// owns the rest of the flow.

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
  .option("--public-link", "enable public link", false)
  .option("--public-limit <n>", "public link tester limit", (v) => parseInt(v, 10))
  .option("--feedback", "enable in-app feedback", false)
  .action(
    (name: string, options: { publicLink?: boolean; publicLimit?: number; feedback?: boolean }) =>
      exitWith(
        runTestflightGroupsCreate({
          name,
          publicLink: options.publicLink,
          publicLimit: options.publicLimit,
          feedback: options.feedback,
        }),
      ),
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

testflight
  .command("remove <email>")
  .description("Remove a beta tester.")
  .action((email: string) => exitWith(runTestflightRemove(email)));

testflight
  .command("whats-new <buildId> <text>")
  .description('Set the "What\'s new" release notes for a TestFlight build.')
  .option("--locale <locale>", "ISO locale", "en-US")
  .action((buildId: string, text: string, options: { locale?: string }) =>
    exitWith(runTestflightWhatsNew({ buildId, locale: options.locale ?? "en-US", text })),
  );

/* -------------------------------------------------------------- reviews --- */

const reviewsCmd = program
  .command("reviews")
  .description("Customer reviews + responses via ASC API.");

reviewsCmd
  .command("list")
  .description("List customer reviews.")
  .option("--territory <code>", "filter by territory (e.g. US)")
  .option("--rating <n>", "filter by rating (1-5)", (v) => parseInt(v, 10))
  .option("--limit <n>", "max items", (v) => parseInt(v, 10), 50)
  .option("--json", "JSON output", false)
  .action((options) => exitWith(runReviewsList(options)));

reviewsCmd
  .command("unanswered")
  .description("List reviews without a response.")
  .option("--days <n>", "older than N days", (v) => parseInt(v, 10))
  .option("--limit <n>", "max items to scan", (v) => parseInt(v, 10), 200)
  .option("--json", "JSON output", false)
  .action((options) => exitWith(runReviewsUnanswered(options)));

reviewsCmd
  .command("respond <reviewId> <body>")
  .description("Post a response to a customer review.")
  .action((reviewId: string, body: string) => exitWith(runReviewsRespond({ reviewId, body })));

reviewsCmd
  .command("delete-response <responseId>")
  .description("Delete a review response.")
  .action((responseId: string) => exitWith(runReviewsDeleteResponse(responseId)));

/* -------------------------------------------------------------- sandbox --- */

const sandboxCmd = program
  .command("sandbox")
  .description("Sandbox testers for IAP testing via ASC API.");

sandboxCmd
  .command("list")
  .description("List sandbox testers.")
  .option("--json", "JSON output", false)
  .action((options) => exitWith(runSandboxList(options)));

sandboxCmd
  .command("create")
  .description("Create a sandbox tester.")
  .requiredOption("--email <email>")
  .requiredOption("--password <password>", "8+ chars; this is the App Store sandbox password")
  .requiredOption("--first-name <name>")
  .requiredOption("--last-name <name>")
  .requiredOption("--territory <code>", "ISO territory code (e.g. USA)")
  .action(
    (options: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      territory: string;
    }) => exitWith(runSandboxCreate(options)),
  );

sandboxCmd
  .command("delete <id>")
  .description("Delete a sandbox tester.")
  .action((id: string) => exitWith(runSandboxDelete(id)));

program.parse();
