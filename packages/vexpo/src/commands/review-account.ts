/**
 * `vexpo review-account`. seeds the App Review demo account on the current
 * Convex deployment so Apple's reviewer can sign in without an OTP.
 *
 * Reads `apple.review.demoUsername` + `demoPassword` from `store.config.json`,
 * calls the internal `admin:createReviewAccount` action, and marks the email
 * verified. Idempotent: re-runs no-op if the user exists with the right email.
 */

import { readFile } from "node:fs/promises";

import { bad, line, note, ok, section } from "../lib/output.ts";
import { dlx } from "../lib/pkg-manager.ts";
import { spawn, streamText } from "../lib/proc.ts";

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

  try {
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
    const tryRun = async (
      extraArgs: string[],
    ): Promise<{ ok: boolean; out: string; err: string }> => {
      const proc = spawn(
        [dlx(), "convex", "run", ...extraArgs, "admin:createReviewAccount", payload],
        { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
      );
      const code = await proc.exited;
      return {
        ok: code === 0,
        out: await streamText(proc.stdout),
        err: await streamText(proc.stderr),
      };
    };

    let result = await tryRun(["--component-function"]);
    if (!result.ok) result = await tryRun([]);
    if (!result.ok) {
      bad("convex run failed");
      const stderr = result.err.trim();
      if (stderr) note(stderr);
      return 1;
    }
    process.stderr.write(result.out);

    line();
    ok("review account ready, Apple's reviewer can now sign in");
    note(`email:    ${email}`);
    note(`password: ${password}`);
    note("paste these into ASC App Information → App Review → Sign-In Information");
    return 0;
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
