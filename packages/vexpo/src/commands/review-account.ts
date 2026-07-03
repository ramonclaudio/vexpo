import { readFile } from "node:fs/promises";

import { bad, line, note, ok, section } from "../lib/output.ts";
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

export async function runReviewAccount(options: ReviewAccountOptions): Promise<number> {
  section("App Review demo account");

  const config = JSON.parse(await readFile("store.config.json", "utf8")) as StoreConfig;
  const email = options.email ?? config.apple?.review?.demoUsername;
  const password = options.password ?? config.apple?.review?.demoPassword;
  const name = options.name ?? "App Review";

  if (!email || !password) {
    bad(
      "missing email/password (set --email and --password, or fill apple.review.demo* in store.config.json)",
    );
    return 1;
  }

  ok(`email: ${email}`);

  const payload = JSON.stringify({
    email,
    password,
    name,
    ...(options.username ? { username: options.username } : {}),
  });
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
  const { code, stdout, stderr } = await run(
    [dlx(), "convex", "run", "admin:createReviewAccount", payload],
    { stdin: "ignore" },
  );
  if (code !== 0) {
    bad("convex run failed");
    const trimmed = stderr.trim();
    if (trimmed) note(trimmed);
    return 1;
  }
  process.stderr.write(stdout);

  line();
  ok("review account ready, Apple's reviewer can now sign in");
  note(`email:    ${email}`);
  note(`password: ${password}`);
  note("paste these into ASC App Information → App Review → Sign-In Information");
  return 0;
}
