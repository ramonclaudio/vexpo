import { fileExists } from "../lib/fs.ts";
import {
  DIM,
  GREEN,
  RED,
  RESET,
  YELLOW,
  bad,
  emitJson,
  errText,
  line,
  note,
  section,
} from "../lib/output.ts";
import { renderVerifyResults } from "../lib/verify-render.ts";
import { readContext, summarize, verifyAll, type Channel, type Check } from "../lib/verify.ts";

const PROJECT_SENTINELS = ["app.config.ts", "convex", "eas.json"];

async function isInVexpoProject(): Promise<boolean> {
  for (const sentinel of PROJECT_SENTINELS) if (await fileExists(sentinel)) return true;
  return false;
}

type DoctorOptions = {
  channel?: string;
  json?: boolean;
  strict?: boolean;
};

function resolveChannel(value: string | undefined): Channel | null {
  if (value === undefined || value === "dev") return "dev";
  if (value === "prod" || value === "production") return "prod";
  return null;
}

function renderDoctor(
  channel: Channel,
  checks: Check[],
  summary: ReturnType<typeof summarize>,
): void {
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

export async function runDoctor(options: DoctorOptions): Promise<number> {
  try {
    if (!(await isInVexpoProject())) {
      if (options.json) {
        emitJson({ error: "not in a vexpo project", cwd: process.cwd() });
      } else {
        section("Verify");
        bad("not in a vexpo project (no app.config.ts, convex/ or eas.json here)");
        note(`cwd: ${process.cwd()}`);
        note(
          "cd into your project, or run `npm create @ramonclaudio/vexpo@latest my-app` to make one",
        );
      }
      return 1;
    }

    const channel = resolveChannel(options.channel);
    if (!channel) {
      bad(`unknown --channel '${options.channel}' (allowed: dev, prod)`);
      return 2;
    }
    const ctx = await readContext(channel);
    const checks = await verifyAll(ctx);
    const summary = summarize(checks);

    if (options.json) {
      emitJson({ channel, summary, checks });
    } else {
      renderDoctor(channel, checks, summary);
    }

    const shouldFail = summary.fail > 0 || (options.strict === true && summary.warn > 0);
    return shouldFail ? 1 : 0;
  } catch (err) {
    process.stderr.write(`doctor failed: ${errText(err)}\n`);
    return 2;
  }
}
