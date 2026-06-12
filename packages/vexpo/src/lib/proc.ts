import { spawn as nodeSpawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";

export type StdioOption = "inherit" | "pipe" | "ignore";

export type ProcOpts = {
  stdin?: StdioOption;
  stdout?: StdioOption;
  stderr?: StdioOption;
  stdio?: [StdioOption, StdioOption, StdioOption];
  env?: Record<string, string | undefined>;
  cwd?: string;
};

export type SpawnedProc = {
  exited: Promise<number>;
  stdout: Readable | null;
  stderr: Readable | null;
  stdin: Writable | null;
  pid: number;
  kill: (signal?: NodeJS.Signals) => void;
};

export function spawn(argv: readonly string[], opts: ProcOpts = {}): SpawnedProc {
  const stdio: [StdioOption, StdioOption, StdioOption] = opts.stdio ?? [
    opts.stdin ?? "inherit",
    opts.stdout ?? "inherit",
    opts.stderr ?? "inherit",
  ];
  const proc = nodeSpawn(argv[0]!, argv.slice(1), {
    stdio,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    cwd: opts.cwd,
  });
  const exited = new Promise<number>((resolve) => {
    proc.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    proc.once("error", () => resolve(1));
  });
  return {
    exited,
    stdout: proc.stdout,
    stderr: proc.stderr,
    stdin: proc.stdin,
    pid: proc.pid ?? -1,
    kill: (signal) => proc.kill(signal),
  };
}

export async function streamText(stream: Readable | null): Promise<string> {
  if (!stream) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Spawn + collect stdout + stderr + exit code, all concurrently. Use this
 * instead of `spawn(...) + streamText` when you want to avoid the pitfall
 * where awaiting `exited` before reading the stream loses output.
 */
export async function run(
  argv: readonly string[],
  opts: ProcOpts = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = spawn(argv, {
    stdin: opts.stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
    // run() exists to PARSE output. A FORCE_COLOR=1 in the caller's shell
    // (CI, recordings) makes child CLIs wrap fields in ANSI codes and every
    // regex parser downstream silently misses. Force color off; an explicit
    // opts.env can still override.
    env: { FORCE_COLOR: "0", NO_COLOR: "1", ...opts.env },
    cwd: opts.cwd,
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    streamText(proc.stdout),
    streamText(proc.stderr),
  ]);
  return { code, stdout, stderr };
}
