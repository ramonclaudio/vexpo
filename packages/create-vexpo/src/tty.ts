import { createInterface } from "node:readline/promises";

const COLOR = process.stdout.isTTY === true && !process.env.NO_COLOR;

const wrap =
  (open: number, close: number) =>
  (s: string): string =>
    COLOR ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const red = wrap(31, 39);
const green = wrap(32, 39);
const yellow = wrap(33, 39);
export const cyan = wrap(36, 39);
export const gray = wrap(90, 39);
export const bold = wrap(1, 22);
export const dim = wrap(2, 22);

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_MS = 80;

export type Spinner = {
  succeed: (text: string) => void;
  fail: (text: string) => void;
  warn: (text: string) => void;
};

export function spinner(text: string): Spinner {
  const animate = process.stderr.isTTY === true;
  let timer: NodeJS.Timeout | null = null;
  let frame = 0;

  const paint = (): void => {
    process.stderr.write(`\r\x1b[2K${FRAMES[frame]} ${text}`);
  };

  if (animate) {
    paint();
    timer = setInterval(() => {
      frame = (frame + 1) % FRAMES.length;
      paint();
    }, FRAME_MS);
    timer.unref();
  } else {
    process.stderr.write(`${text}\n`);
  }

  const done = (symbol: string, message: string): void => {
    if (timer) clearInterval(timer);
    if (animate) process.stderr.write("\r\x1b[2K");
    process.stderr.write(`${symbol} ${message}\n`);
  };

  return {
    succeed: (m) => done(green("✔"), m),
    fail: (m) => done(red("✖"), m),
    warn: (m) => done(yellow("⚠"), m),
  };
}

export async function askText(opts: {
  message: string;
  initial: string;
  validate: (value: string) => true | string;
}): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let settled = false;
  // Ctrl-C and Ctrl-D close the interface without answering. Without this the
  // question promise never settles and the scaffolder hangs.
  rl.once("close", () => {
    if (!settled) process.exit(1);
  });
  try {
    for (;;) {
      const raw = await rl.question(`${cyan("?")} ${opts.message} ${gray(`(${opts.initial})`)} `);
      const value = raw.trim() || opts.initial;
      const check = opts.validate(value);
      if (check === true) {
        settled = true;
        return value;
      }
      process.stdout.write(`${red("✖")} ${check}\n`);
    }
  } finally {
    settled = true;
    rl.close();
  }
}
