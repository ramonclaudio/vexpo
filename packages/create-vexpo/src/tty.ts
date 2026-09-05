import { createInterface } from "node:readline/promises";

// `NO_COLOR` is the cross-tool opt-out (any non-empty value) and `TERM=dumb` is
// what a terminal that cannot handle escapes reports, which is what a screen
// reader runs under. A pipe or a log file gets none either.
const plain = (): boolean => !!process.env.NO_COLOR || process.env.TERM === "dumb";

const colorOn = (stream: NodeJS.WriteStream): boolean => stream.isTTY === true && !plain();

const wrap =
  (open: number, close: number, stream: NodeJS.WriteStream = process.stdout) =>
  (s: string): string =>
    colorOn(stream) ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const red = wrap(31, 39);
export const cyan = wrap(36, 39);
export const gray = wrap(90, 39);
export const bold = wrap(1, 22);
export const dim = wrap(2, 22);

// The spinner writes to stderr, so its symbols follow stderr, not stdout.
const errRed = wrap(31, 39, process.stderr);
const errGreen = wrap(32, 39, process.stderr);
const errYellow = wrap(33, 39, process.stderr);

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_MS = 80;

export type Spinner = {
  succeed: (text: string) => void;
  fail: (text: string) => void;
  warn: (text: string) => void;
};

// A repainting line is re-announced on every repaint, so twelve braille frames
// a second is twelve announcements a second for the length of an install. The
// same signals that turn colour off turn the animation off, and `TERM=dumb` is
// what a screen reader's terminal sets. Everyone who opts out gets the one-line
// form below instead.
export function spinner(text: string): Spinner {
  const animate = process.stderr.isTTY === true && !plain();
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
    succeed: (m) => done(errGreen("✔"), m),
    fail: (m) => done(errRed("✖"), m),
    warn: (m) => done(errYellow("⚠"), m),
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
