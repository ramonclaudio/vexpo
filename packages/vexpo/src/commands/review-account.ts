import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { findProdEnvFile, readEnvFile } from "../lib/env-files.ts";
import { bad, line, nop, note, ok, section, yep } from "../lib/output.ts";
import { dlx } from "../lib/pkg-manager.ts";
import { run } from "../lib/proc.ts";

type ReviewAccountOptions = {
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

function generatePassword(): string {
  return `rv-${randomBytes(16)
    .toString("base64url")
    .replace(/[-_0OIl1]/g, "")}`.slice(0, 20);
}

async function seed(payload: string, envFile?: string): Promise<boolean> {
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

async function writeBack(config: StoreConfig, email: string, password: string): Promise<void> {
  const review = config.apple?.review;
  if (!review || (review.demoUsername === email && review.demoPassword === password)) return;
  review.demoUsername = email;
  review.demoPassword = password;
  await writeFile("store.config.json", JSON.stringify(config, null, 2) + "\n");
  ok("wrote the demo login into store.config.json (review section)");
}

async function prodEnvFile(): Promise<string | null> {
  const file = await findProdEnvFile();
  if (!file) return null;
  const env = await readEnvFile(file);
  const key = env.get("CONVEX_DEPLOY_KEY") ?? "";
  const selector = env.get("CONVEX_DEPLOYMENT") ?? "";
  return key.startsWith("prod:") || selector.startsWith("prod:") ? file : null;
}

function resolveCreds(
  options: ReviewAccountOptions,
  config: StoreConfig,
): { email: string; password: string } | null {
  const review = config.apple?.review;
  const email = options.email ?? review?.demoUsername;
  if (!email) return null;
  const configured = options.password ?? review?.demoPassword;
  if (configured && configured !== PLACEHOLDER) return { email, password: configured };
  ok("generated a demo password, the placeholder is never used");
  return { email, password: generatePassword() };
}

async function seedBothChannels(payload: string): Promise<boolean> {
  if (!(await seed(payload))) return false;
  const prodFile = await prodEnvFile();
  if (!prodFile) {
    nop("no .env.prod with a prod key, so prod was skipped (run this again once prod exists)");
    yep("App Review signs in to the production build, so do that before you submit");
    return true;
  }
  if (!(await seed(payload, prodFile))) return false;
  ok("created on the prod deployment too");
  return true;
}

async function readStoreConfig(): Promise<StoreConfig | null> {
  try {
    return JSON.parse(await readFile("store.config.json", "utf8")) as StoreConfig;
  } catch {
    return null;
  }
}

export async function runReviewAccount(options: ReviewAccountOptions): Promise<number> {
  section("App Review demo account");

  const config = await readStoreConfig();
  if (!config) {
    bad("no readable store.config.json here. Run from your project root.");
    note(
      "the template ships one, and `npx eas-cli metadata:pull` writes one from App Store Connect",
    );
    return 1;
  }
  const creds = resolveCreds(options, config);
  if (!creds) {
    bad("missing email (set --email, or fill apple.review.demoUsername in store.config.json)");
    return 1;
  }
  const { email, password } = creds;

  ok(`email: ${email}`);

  const payload = JSON.stringify({
    email,
    password,
    name: options.name ?? "App Review",
    reset: true,
    ...(options.username ? { username: options.username } : {}),
  });

  if (!(await seedBothChannels(payload))) return 1;

  await writeBack(config, email, password);

  line();
  ok("review account ready, Apple's reviewer can sign in");
  note(`email:    ${email}`);
  note(`password: ${password}`);
  note("paste these into App Store Connect under App Review > Sign-In Information");
  return 0;
}
