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
  redact?: boolean;
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

// Mask identifying values for screenshots, demos, and pasted issue reports.
// Statuses and check names stay readable, the values become placeholders.
// Order matters: URLs before bare slugs, emails before domains.
const REDACTIONS: [RegExp, string][] = [
  [/https?:\/\/[a-z0-9-]+\.convex\.(cloud|site)[^\s]*/g, "https://<deployment>.convex.$1"],
  [/\b[a-z]+-[a-z]+-\d{3}\b/g, "<deployment>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<project-id>"],
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "<email>"],
  [/\b(?:[a-z0-9-]+\.){1,}[a-z]{2,}\b(?= verified)/g, "<domain>"],
  [/\b(?:com|io|dev|app|net|org)(?:\.[a-z0-9-]+){2,}\b/gi, "<bundle-id>"],
  [/\b[A-Z0-9]{10}\b/g, "<id>"],
  [/(@)[\w-]+(\/)/g, "$1<owner>$2"],
];

export function redactValue(text: string): string {
  let out = text;
  for (const [re, sub] of REDACTIONS) out = out.replace(re, sub);
  return out;
}

function categoryHeader(c: Category): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function printResults(checks: Check[], redact: boolean): void {
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
      const message = redact ? redactValue(c.message) : c.message;
      line(`  ${icon(c.severity)} ${BOLD}${c.name.padEnd(w)}${RESET}  ${message}`);
      if (c.details) line(`       ${DIM}${redact ? redactValue(c.details) : c.details}${RESET}`);
    }
  }
}

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
      printResults(checks, options.redact === true);
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
