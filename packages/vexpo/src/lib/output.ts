import { createInterface } from "node:readline/promises";

import { spawn } from "./proc.ts";

const colorEnabled =
  process.stderr.isTTY === true && !process.env.NO_COLOR && process.env.TERM !== "dumb";

const code = (seq: string): string => (colorEnabled ? seq : "");

export const RESET = code("\x1b[0m");
export const BOLD = code("\x1b[1m");
export const DIM = code("\x1b[2m");

function ansiHex(hex: string): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return "";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return code(`\x1b[38;2;${r};${g};${b}m`);
}

export const GREEN = ansiHex("#22c55e");
export const RED = ansiHex("#ef4444");
export const YELLOW = ansiHex("#f59e0b");
const VIOLET = ansiHex("#a78bfa");

export const line = (s = ""): void => {
  process.stderr.write(s + "\n");
};
export const ok = (m: string): void => line(`  ${GREEN}ok${RESET}   ${m}`);
export const nop = (m: string): void => line(`  ${DIM}--   ${m}${RESET}`);
export const yep = (m: string): void => line(`  ${YELLOW}!!${RESET}   ${m}`);
export const bad = (m: string): void => line(`  ${RED}xx${RESET}   ${RED}${m}${RESET}`);
export const note = (m: string): void => line(`       ${DIM}${m}${RESET}`);

// The only stdout writer here, so `--json` stays pipeable while the rest goes to stderr.
export function emitJson(value: unknown): number {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  return 0;
}

export const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));
export const plural = (n: number): string => (n === 1 ? "" : "s");

export function section(title: string): void {
  if (!colorEnabled) {
    line(`\n${title}`);
    return;
  }
  const w = process.stderr.columns ?? process.stdout.columns ?? 80;
  const fill = "─".repeat(Math.max(0, w - [...title].length - 3));
  line(`\n${BOLD}${VIOLET}${title}${RESET} ${DIM}${fill}${RESET}`);
}

export async function ask(question: string): Promise<string> {
  process.stderr.write(question);
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
  try {
    const answer = await new Promise<string>((resolve) => {
      rl.once("line", (raw: string) => resolve(raw));
      rl.once("close", () => resolve(""));
    });
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function askYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const raw = (await ask(`  ${question} ${DIM}[${hint}] >${RESET} `)).toLowerCase();
  if (!raw) return defaultYes;
  return raw === "y" || raw === "yes";
}

type HelpPrompt = {
  body?: string;
  urls: { label: string; url: string }[];
  allowSkip?: boolean;
};

export async function helpAndWait(opts: HelpPrompt): Promise<void> {
  if (opts.body) note(opts.body);
  for (const { label, url } of opts.urls) {
    note(`  ${label}: ${BOLD}${url}${RESET}`);
  }
  if (!process.stdin.isTTY) return;
  const skipHint = opts.allowSkip ? ", 'skip' to skip" : "";
  const openHint = opts.urls.length > 0 ? ", 'open' to open it in the browser" : "";
  for (;;) {
    const input = (await ask(`  ${DIM}Enter when ready${skipHint}${openHint} >${RESET} `))
      .trim()
      .toLowerCase();
    if (!input || (input === "skip" && opts.allowSkip)) return;
    const target =
      input === "open"
        ? opts.urls[0]
        : /^open \d+$/.test(input)
          ? opts.urls[Number(input.slice(5)) - 1]
          : undefined;
    if (target) {
      spawn(["open", target.url], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
      continue;
    }
    yep("press Enter, type 'open' to open the URL, or 'skip'");
  }
}
