/**
 * `vexpo doctor`. cross-source drift detection.
 *
 * Auth-checks every credential and cross-references bundle id / team id /
 * Services ID across .env.local, Convex env, EAS env, and app.config.ts.
 * Decodes the Apple JWT to confirm its claims match the configured Team ID +
 * Services ID + Key ID, and warns when the JWT is close to expiry.
 *
 * Exit status: 0 if all ok (warnings allowed), 1 if any fail (or any warn
 * under --strict), 2 if the runner itself crashed.
 */

import { access } from "node:fs/promises";

import { BOLD, DIM, GREEN, RED, RESET, YELLOW, bad, line, note, section } from "../lib/output.ts";
import {
  readContext,
  summarize,
  verifyAll,
  type Category,
  type Check,
  type Channel,
} from "../lib/verify.ts";

// A vexpo project must have at minimum these files at the root. If none are
// present, the user is in the wrong directory.
const PROJECT_SENTINELS = ["app.config.ts", "convex", "eas.json"];

async function isInVexpoProject(): Promise<boolean> {
  for (const sentinel of PROJECT_SENTINELS) {
    try {
      await access(sentinel);
      return true;
    } catch {
      // continue
    }
  }
  return false;
}

export type DoctorOptions = {
  channel?: string;
  json?: boolean;
  strict?: boolean;
};

function icon(severity: Check["severity"]): string {
  switch (severity) {
    case "ok":
      return `${GREEN}✓${RESET}`;
    case "warn":
      return `${YELLOW}⚠${RESET}`;
    case "fail":
      return `${RED}✗${RESET}`;
    case "skip":
      return `${DIM}-${RESET}`;
  }
}

function categoryHeader(c: Category): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function printResults(checks: Check[]): void {
  const byCategory = new Map<Category, Check[]>();
  for (const c of checks) {
    if (!byCategory.has(c.category)) byCategory.set(c.category, []);
    byCategory.get(c.category)!.push(c);
  }
  const order: Category[] = ["files", "convex", "resend", "apple", "eas", "coherence"];
  for (const cat of order) {
    const items = byCategory.get(cat);
    if (!items || items.length === 0) continue;
    section(categoryHeader(cat));
    const w = Math.max(...items.map((c) => c.name.length));
    for (const c of items) {
      line(`  ${icon(c.severity)} ${BOLD}${c.name.padEnd(w)}${RESET}  ${c.message}`);
      if (c.details) line(`       ${DIM}${c.details}${RESET}`);
    }
  }
}

export async function runDoctor(options: DoctorOptions): Promise<number> {
  try {
    // Reject early when run from a non-project directory. Without this guard,
    // the probe runs against an unrelated CWD and surfaces failures that look
    // like a misconfigured vexpo project (it's the wrong directory).
    if (!(await isInVexpoProject())) {
      if (options.json) {
        process.stdout.write(
          JSON.stringify({ error: "not in a vexpo project", cwd: process.cwd() }, null, 2) + "\n",
        );
      } else {
        section("Verify");
        bad("not in a vexpo project (no app.config.ts, convex/, or eas.json in current dir)");
        note(`cwd: ${process.cwd()}`);
        note("cd into your vexpo project, or run `npm create vexpo@latest my-app` to scaffold one");
      }
      return 1;
    }

    // Accept `dev` (default), `prod`, or `production`. Reject anything else
    // with a clear message; silently coercing typos to dev hides config errors.
    let channel: Channel;
    if (options.channel === undefined || options.channel === "dev") {
      channel = "dev";
    } else if (options.channel === "prod" || options.channel === "production") {
      channel = "prod";
    } else {
      bad(`unknown --channel '${options.channel}' (allowed: dev, prod)`);
      return 2;
    }
    const ctx = await readContext(channel);
    const checks = await verifyAll(ctx);
    const summary = summarize(checks);

    if (options.json) {
      process.stdout.write(JSON.stringify({ channel, summary, checks }, null, 2) + "\n");
    } else {
      section(`Verify (${channel})`);
      printResults(checks);
      line();
      const parts = [
        `${GREEN}${summary.ok} ok${RESET}`,
        summary.warn > 0 ? `${YELLOW}${summary.warn} warn${RESET}` : null,
        summary.fail > 0 ? `${RED}${summary.fail} fail${RESET}` : null,
        summary.skip > 0 ? `${DIM}${summary.skip} skip${RESET}` : null,
      ].filter(Boolean);
      line(`  ${parts.join(", ")}`);
    }

    const shouldFail = summary.fail > 0 || (options.strict === true && summary.warn > 0);
    return shouldFail ? 1 : 0;
  } catch (err) {
    process.stderr.write(`doctor failed: ${err instanceof Error ? err.message : err}\n`);
    return 2;
  }
}
