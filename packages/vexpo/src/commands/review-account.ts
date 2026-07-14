import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { readEnvFile } from "../lib/env-files.ts";
import { fileExists } from "../lib/fs.ts";
import { bad, line, nop, note, ok, section, yep } from "../lib/output.ts";
import { dlx } from "../lib/pkg-manager.ts";
import { run } from "../lib/proc.ts";

export type ReviewAccountOptions = {
  email?: string;
  password?: string;
  name?: string;
  username?: string;
};

type StoreConfig = {
  apple?: {
    review?: { demoUsername?: string; demoPassword?: string };
    info?: Record<string, { title?: string }>;
  };
};

const PLACEHOLDER = "REPLACE_BEFORE_SUBMIT";

// base64url without lookalikes; 16 bytes clears signUpSchema's 10-char floor
// with room to spare after stripping.
function generatePassword(): string {
  return `rv-${randomBytes(16)
    .toString("base64url")
    .replace(/[-_0OIl1]/g, "")}`.slice(0, 20);
}

async function seed(payload: string, envFile?: string): Promise<boolean> {
  // admin:createReviewAccount is an app-root internalAction, so a plain
  // `convex run admin:createReviewAccount <json>` reaches it (no --component).
  // Drain stdout/stderr concurrently with exit (via run()); awaiting exited
  // before reading the pipes deadlocks on >64KB of convex output and can lose
  // the error text the command exists to surface.
  //
  // The demo password rides in the argv JSON token: `convex run` has no
  // file/stdin channel for args. This is a low-value Apple-review demo login
  // (usually already committed in store.config.json), so argv exposure is
  // accepted here rather than standing up an HTTP function-run path for it.
  const argv = [dlx(), "convex", "run", "admin:createReviewAccount", payload];
  if (envFile) argv.push("--env-file", envFile);
  const { code, stdout, stderr } = await run(argv, { stdin: "ignore" });
  if (code !== 0) {
    bad(`convex run failed${envFile ? ` (${envFile})` : ""}`);
    const trimmed = stderr.trim();
    if (trimmed) note(trimmed);
    return false;
  }
  process.stderr.write(stdout);
  return true;
}

// store.config.json is what `eas metadata:push` sends to Apple, so the seeded
// credentials and the file must never drift apart.
async function writeBack(config: StoreConfig, email: string, password: string): Promise<void> {
  const review = config.apple?.review;
  if (!review || (review.demoUsername === email && review.demoPassword === password)) return;
  review.demoUsername = email;
  review.demoPassword = password;
  await writeFile("store.config.json", JSON.stringify(config, null, 2) + "\n");
  await run([dlx(), "oxfmt", "store.config.json"]);
  ok("wrote the demo credentials into store.config.json (review section)");
}

/**
 * The prod deployment needs the same account: App Review signs into the
 * TestFlight/production build, which talks to prod. Only reachable through a
 * prod-scoped env file; a dev CONVEX_DEPLOY_KEY in .env.local silently wins
 * over --prod, so bare forms are never used.
 */
async function prodEnvFile(): Promise<string | null> {
  const file = (await fileExists(".env.prod"))
    ? ".env.prod"
    : (await fileExists(".env.production"))
      ? ".env.production"
      : null;
  if (!file) return null;
  const env = await readEnvFile(file);
  const key = env.get("CONVEX_DEPLOY_KEY") ?? "";
  const selector = env.get("CONVEX_DEPLOYMENT") ?? "";
  return key.startsWith("prod:") || selector.startsWith("prod:") ? file : null;
}

export async function runReviewAccount(options: ReviewAccountOptions): Promise<number> {
  section("App Review demo account");

  const config = JSON.parse(await readFile("store.config.json", "utf8")) as StoreConfig;
  const email = options.email ?? config.apple?.review?.demoUsername;
  const configured = config.apple?.review?.demoPassword;
  const name = options.name ?? "App Review";

  if (!email) {
    bad("missing email (set --email, or fill apple.review.demoUsername in store.config.json)");
    return 1;
  }

  // The template ships a placeholder password; never seed it (a guessable
  // login on the deployment). Mint a real one instead of hard-failing.
  let password = options.password ?? configured;
  if (!password || password === PLACEHOLDER) {
    password = generatePassword();
    ok("generated a demo password (placeholder never gets seeded)");
  }

  ok(`email: ${email}`);

  // `reset: true` rotates an existing account's password to this value, so a
  // regenerated or corrected credential converges instead of silently keeping
  // the old one.
  const payload = JSON.stringify({
    email,
    password,
    name,
    reset: true,
    ...(options.username ? { username: options.username } : {}),
  });

  if (!(await seed(payload))) return 1;

  const prodFile = await prodEnvFile();
  if (prodFile) {
    if (!(await seed(payload, prodFile))) return 1;
    ok("seeded on the prod deployment too");
  } else {
    nop("no prod-scoped .env.prod; prod seeding skipped (re-run once prod exists)");
    yep("App Review signs into the PRODUCTION build, so seed prod before submitting");
  }

  await writeBack(config, email, password);

  line();
  ok("review account ready, Apple's reviewer can now sign in");
  note(`email:    ${email}`);
  note(`password: ${password}`);
  note("paste these into ASC App Information → App Review → Sign-In Information");
  return 0;
}
