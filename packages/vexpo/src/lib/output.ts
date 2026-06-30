import { createInterface } from "node:readline/promises";

export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";

function ansiHex(hex: string): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return "";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export const GREEN = ansiHex("#22c55e");
export const RED = ansiHex("#ef4444");
export const YELLOW = ansiHex("#f59e0b");
export const VIOLET = ansiHex("#a78bfa");

const write = (s: string): void => {
  process.stderr.write(s);
};
export const line = (s = ""): void => {
  process.stderr.write(s + "\n");
};
export const ok = (m: string): void => line(`  ${GREEN}ok${RESET}   ${m}`);
export const nop = (m: string): void => line(`  ${DIM}--   ${m}${RESET}`);
export const yep = (m: string): void => line(`  ${YELLOW}!!${RESET}   ${m}`);
export const bad = (m: string): void => line(`  ${RED}xx${RESET}   ${RED}${m}${RESET}`);
export const note = (m: string): void => line(`       ${DIM}${m}${RESET}`);

function stringWidth(s: string): number {
  return [...s].length;
}

export function section(title: string): void {
  const w = process.stderr.columns ?? process.stdout.columns ?? 80;
  const fill = "─".repeat(Math.max(0, w - stringWidth(title) - 3));
  line(`\n${BOLD}${VIOLET}${title}${RESET} ${DIM}${fill}${RESET}`);
}

export async function ask(question: string): Promise<string> {
  write(question);
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

async function openUrlExternal(url: string): Promise<void> {
  const { spawn } = await import("./proc.ts");
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  spawn(cmd, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
}

export async function helpAndWait(opts: {
  body?: string;
  urls: { label: string; url: string }[];
  allowSkip?: boolean;
  skipLabel?: string;
}): Promise<"ready" | "skip"> {
  if (opts.body) note(opts.body);
  for (const { label, url } of opts.urls) {
    note(`  ${label}: ${BOLD}${url}${RESET}`);
  }
  if (!process.stdin.isTTY) {
    return opts.allowSkip ? "skip" : "ready";
  }
  const skipHint = opts.allowSkip ? `, '${opts.skipLabel ?? "skip"}' to skip` : "";
  const openHint = opts.urls.length > 0 ? ", 'open' to launch in browser" : "";
  for (;;) {
    const input = (await ask(`  ${DIM}Enter when ready${skipHint}${openHint} >${RESET} `))
      .trim()
      .toLowerCase();
    if (!input) return "ready";
    if (input === (opts.skipLabel ?? "skip") && opts.allowSkip) return "skip";
    if (input === "open" && opts.urls.length > 0) {
      await openUrlExternal(opts.urls[0].url);
      continue;
    }
    if (input.startsWith("open ") && opts.urls.length > 0) {
      const idx = parseInt(input.slice(5), 10);
      const target = opts.urls[idx - 1];
      if (target) {
        await openUrlExternal(target.url);
        continue;
      }
    }
    yep("press Enter, type 'open' to launch the URL, or 'skip' to bypass");
  }
}

export function fail(err: unknown): never {
  bad(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
