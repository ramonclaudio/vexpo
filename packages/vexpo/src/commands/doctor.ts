import { access } from "node:fs/promises";

import { DIM, GREEN, RED, RESET, YELLOW, bad, line, note, section } from "../lib/output.ts";
import { renderVerifyResults } from "../lib/verify-render.ts";
import { readContext, summarize, verifyAll, type Channel } from "../lib/verify.ts";

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

export async function runDoctor(options: DoctorOptions): Promise<number> {
  try {
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
      renderVerifyResults(checks, "section");
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
