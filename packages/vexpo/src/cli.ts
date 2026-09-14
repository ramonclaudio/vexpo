import { Command } from "commander";

import pkg from "../package.json" with { type: "json" };
import { runAccounts } from "./commands/accounts.ts";
import { runAdopt } from "./commands/adopt.ts";
import { runAppleCredentials } from "./commands/apple/credentials.ts";
import { runAppleJwt } from "./commands/apple/jwt.ts";
import { runAscKey } from "./commands/apple/asc-key.ts";
import { runServicesId } from "./commands/apple/services-id.ts";
import { runAscConnect } from "./commands/asc.ts";
import {
  runAccessibilityLint,
  runAccessibilityPush,
  runAccessibilityShow,
} from "./commands/asc-accessibility.ts";
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
import { runConvex, type ConvexOptions } from "./commands/convex.ts";
import { runConvexMigrate } from "./commands/convex-migrate.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runEnvPush } from "./commands/env/push.ts";
import { runRebrand } from "./commands/rebrand.ts";
import { runResend, type ResendOptions } from "./commands/resend.ts";
import { runReviewAccount } from "./commands/review-account.ts";
import { runSetup, type SetupOptions } from "./commands/setup.ts";
import { runSubmit } from "./commands/submit.ts";
import { bad, errText } from "./lib/output.ts";

const program = new Command()
  .name("vexpo")
  .description("Sets up and ships a vexpo app (Expo, Convex, Better Auth, Resend).")
  .version(pkg.version, "-v, --version");

type SetupFlags = {
  new?: boolean;
  force?: boolean;
  fresh?: boolean;
  local?: boolean;
  state?: boolean;
  skipRebrand?: boolean;
};

const setupOptions = (lite: boolean, o: SetupFlags): SetupOptions => ({
  lite,
  isNew: o.new,
  force: o.force,
  fresh: o.fresh,
  local: o.local,
  noState: o.state === false,
  skipRebrand: o.skipRebrand,
});

const exitWith = (p: Promise<number>): void => {
  p.then((code) => process.exit(code)).catch((err) => {
    bad(errText(err));
    process.exit(1);
  });
};

const withSetupFlags = (cmd: Command): Command =>
  cmd
    .option("--force", "re-run every step, ignoring the cache", false)
    .option("--fresh", "start over with a new Convex deployment", false)
    .option("--local", "use a local Convex backend", false)
    .option("--no-state", "ignore .setup-state.json");

withSetupFlags(
  program
    .command("lite")
    .summary("Set up Convex and Better Auth for the simulator.")
    .description(
      "Sets up Convex and Better Auth, nothing else. No Apple account, domain, EAS or Resend needed. Sign-up skips the email code. Run `vexpo full` later for the rest.",
    )
    .option("--new", "sign up for Convex first", false),
).action((options: SetupFlags) => exitWith(runSetup(setupOptions(true, options))));

withSetupFlags(
  program
    .command("full")
    .summary("Set up everything you need to reach TestFlight.")
    .description(
      "Sets up Convex, Better Auth, Resend, Sign in with Apple, the App Store Connect key, EAS and the rebrand. You need Apple, Convex, Expo and Resend accounts, or pass `--new` to sign up as you go. Ends by printing the `eas build` command. vexpo never runs `eas build` itself.",
    )
    .option("--new", "sign up for Apple, Convex, Expo and Resend first", false),
)
  .option("--skip-rebrand", "skip the rebrand wizard", false)
  .action((options: SetupFlags) => exitWith(runSetup(setupOptions(false, options))));

program
  .command("accounts")
  .summary("Sign up for Apple, Expo, Convex and Resend.")
  .description("Checks which accounts you're signed in to and walks you through the rest.")
  .option("--check", "check only, exit non-zero if one is missing", false)
  .action((options: { check?: boolean }) => {
    exitWith(runAccounts(options));
  });

program
  .command("rebrand")
  .description("Replace the template defaults with yours.")
  .option("--force", "re-run even if state says done", false)
  .option("-y, --yes", "accept the defaults without asking", false)
  .option("--app-name <name>", "your app's display name")
  .option("--bundle-id <id>", "iOS bundle id (e.g. com.you.app)")
  .option("--package-name <name>", "package.json name")
  .option("--scheme <scheme>", "url scheme")
  .option("--owner-name <name>", "your full name")
  .option("--expo-owner <slug>", "Expo team slug")
  .option("--review-email <email>", "App Review contact email")
  .option("--review-phone <phone>", "App Review contact phone")
  .option("--marketing-url <url>", "marketing URL")
  .option("--support-url <url>", "support URL")
  .option("--privacy-url <url>", "privacy URL")
  .option("--copyright <line>", "copyright line")
  .action((options) => exitWith(runRebrand(options)));

program
  .command("review-account")
  .summary("Create the App Review demo account on dev and prod.")
  .description(
    "Creates the App Review demo account on the dev and prod deployments. Generates a password when store.config.json still has the placeholder and writes it back. Resets the password on an existing account so the file and the deployments match.",
  )
  .option("--email <email>", "override demo email")
  .option("--password <password>", "override demo password")
  .option("--name <name>", "override demo display name", "App Review")
  .option("--username <username>", "optional username")
  .action((options) => exitWith(runReviewAccount(options)));

program
  .command("doctor")
  .summary("Check every credential against the live service.")
  .description(
    "Checks every credential against its service, and that the ids match across .env.local, the Convex env, the EAS env and app.config.ts.",
  )
  .option("--channel <channel>", "dev | prod", "dev")
  .option("--json", "JSON output", false)
  .option("--strict", "fail on warnings", false)
  .action((options: { channel?: string; json?: boolean; strict?: boolean }) => {
    exitWith(runDoctor(options));
  });

program
  .command("adopt")
  .summary("Finish a project the EAS Convex integration made.")
  .description(
    "Finishes a project created by `eas integrations:convex:connect`. Uses the dev deployment it made, fills in the site URLs and Better Auth, lists the project's deployments, and prints the commands left to run.",
  )
  .option("--skip-dev-steps", "only list the deployments and the remaining commands", false)
  .action((options: { skipDevSteps?: boolean }) => exitWith(runAdopt(options)));

const convex = program
  .command("convex")
  .description("Create or connect a Convex deployment.")
  .option("--fresh", "create a new deployment", false)
  .option("--local", "use a local backend", false)
  .option("--name <name>", "override the Convex project name")
  .option(
    "--eas",
    "create it through `eas integrations:convex:connect` instead of `convex dev`",
    false,
  )
  .option("--region <region>", "Convex deployment region for --eas, e.g. aws-us-east-1")
  .action((options: ConvexOptions) => exitWith(runConvex(options)));

convex
  .command("migrate")
  .description(
    "Copy the server-side env (BETTER_AUTH_SECRET, RESEND_*, APPLE_*, APP_*) from another deployment onto this one. CONVEX_* keys are left alone.",
  )
  .requiredOption("--from <deployment>", "deployment slug to copy from")
  .option("--prod", "target the prod deployment (reads its key from .env.prod)")
  .option("--dry-run", "show what would be copied", false)
  .action((options: { from: string; prod?: boolean; dryRun?: boolean }) =>
    exitWith(runConvexMigrate(options)),
  );

program
  .command("better-auth")
  .description("Set the Better Auth env vars on Convex.")
  .option("--rotate-secret", "regenerate BETTER_AUTH_SECRET", false)
  .option("--site-url <url>", "override SITE_URL")
  .option("--app-name <name>", "override APP_NAME")
  .action((options: { rotateSecret?: boolean; siteUrl?: string; appName?: string }) =>
    exitWith(runBetterAuth(options)),
  );

program
  .command("resend")
  .description("Create the Resend sending key and webhook.")
  .option("--name <name>", "override sending key name")
  .option("--from <address>", "override EMAIL_FROM")
  .option(
    "--repoint",
    "move the webhook to the current convex.site and update the secret, keeping the sending key",
  )
  .option("--prod", "with --repoint, target the prod deployment")
  .option(
    "--force",
    "with --repoint, recreate the webhook even if it already points at the endpoint",
  )
  .action((options: ResendOptions) => exitWith(runResend(options)));

const apple = program
  .command("apple")
  .description("Sign in with Apple, the App Store Connect key and signing credentials.");

apple
  .command("asc-key")
  .description("Validate an App Store Connect API key and cache it.")
  .action(() => exitWith(runAscKey()));

apple
  .command("services-id")
  .description(
    "Find the Sign in with Apple Services ID and turn the capability on for the bundle id. Walks you through creating the Services ID in the Apple Developer portal if it doesn't exist, since Apple's API can't create one.",
  )
  .option("--services-id <id>", "override the Services ID")
  .option(
    "--bundle-id <id>",
    "use a bundle id other than .env.local's, like <id>.dev for the dev build",
  )
  .action((options: { servicesId?: string; bundleId?: string }) =>
    exitWith(runServicesId(options)),
  );

apple
  .command("jwt")
  .description(
    "Sign the Sign in with Apple client secret JWT. It lasts 180 days, Apple's limit, so run this again with --rotate before then.",
  )
  .option("--rotate", "re-sign the JWT only", false)
  .option(
    "--copy-from <deployment>",
    "copy the APPLE_* env from another deployment instead of signing, no .p8 needed",
  )
  .action((options: { rotate?: boolean; copyFrom?: string }) => exitWith(runAppleJwt(options)));

apple
  .command("credentials")
  .description(
    "Run `eas credentials:configure-build` with the cached App Store Connect key, so the wizard skips the Apple login. EAS creates the signing certificate and provisioning profile.",
  )
  .option("-e, --profile <name>", "build profile", "production")
  .action((options: { profile?: string }) => exitWith(runAppleCredentials(options)));

const env = program.command("env").description("Push env vars to Convex and EAS together.");

env
  .command("push")
  .description("Read .env.local and .env.prod and push each key where it belongs, Convex or EAS.")
  .option("--force", "overwrite without asking", false)
  .option("--dry-run", "show the plan only", false)
  .option("--no-verify", "skip the checks after the push")
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

const asc = program.command("asc").description("Link App Store Connect and set the labels.");

asc
  .command("connect")
  .description(
    "Write the app's ascAppId into eas.json and link the EAS project to its App Store Connect app through `eas integrations:asc:connect`. Without a terminal it writes the id and skips the link.",
  )
  .option("--force", "re-run even if already connected", false)
  .action((options: { force?: boolean }) => exitWith(runAscConnect(options)));

program
  .command("submit")
  .summary("Submit the latest iOS build to TestFlight.")
  .description(
    "Submit a finished iOS build with no prompts. Uses the cached App Store Connect key and the ascAppId in eas.json, then runs `eas submit --latest`.",
  )
  .option("--profile <name>", "eas.json submit profile", "testflight")
  .option("--id <buildId>", "submit a specific build id (default: the latest finished build)")
  .option("--what-to-test <text>", 'the TestFlight "What to test" notes for this build')
  .action((options: { profile?: string; id?: string; whatToTest?: string }) =>
    exitWith(runSubmit(options)),
  );

const ascPrivacy = asc.command("privacy").description("Privacy labels.");

ascPrivacy
  .command("show [file]")
  .description(
    "Show privacy.config.json. Apple has no API to read the live labels, so set them in App Store Connect.",
  )
  .option("--json", "JSON output", false)
  .action((file: string | undefined, options: { json?: boolean }) =>
    exitWith(runPrivacyShow(file ?? "app-store/privacy.config.json", options)),
  );

ascPrivacy
  .command("lint <file>")
  .description("Validate a local privacy.config.json against Apple's enums.")
  .action((file: string) => exitWith(runPrivacyLint(file)));

const ascA11y = asc.command("accessibility").description("Accessibility labels.");

ascA11y
  .command("show")
  .description("Fetch the app's accessibility declarations and URL.")
  .option("--json", "JSON output", false)
  .action((options: { json?: boolean }) => exitWith(runAccessibilityShow(options)));

ascA11y
  .command("lint <file>")
  .description("Validate a local accessibility.config.json against Apple's schema.")
  .action((file: string) => exitWith(runAccessibilityLint(file)));

ascA11y
  .command("push <file>")
  .description(
    "Send a local accessibility.config.json to App Store Connect. A top-level `url` sets the accessibility link on the product page, null clears it.",
  )
  .option("--publish", "also move the draft onto the App Store page", false)
  .option("--dry-run", "print what would change and send nothing", false)
  .action((file: string, options: { publish?: boolean; dryRun?: boolean }) =>
    exitWith(runAccessibilityPush(file, options)),
  );

const testflight = program
  .command("testflight")
  .description("TestFlight groups, testers and feedback.");

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
  .description("Show a beta group and its testers.")
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
  .description("Add a tester and send the TestFlight invite.")
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
    'Set the "What\'s new" notes on a TestFlight build that is already up. At submit time, `vexpo submit --what-to-test` does the same.',
  )
  .option("--locale <locale>", "ISO locale", "en-US")
  .action((buildId: string, text: string, options: { locale?: string }) =>
    exitWith(runTestflightWhatsNew({ buildId, locale: options.locale ?? "en-US", text })),
  );

program.parse();
