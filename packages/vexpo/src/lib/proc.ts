import { spawn as nodeSpawn } from "node:child_process";
import type { Readable } from "node:stream";
import { text } from "node:stream/consumers";

type StdioOption = "inherit" | "pipe" | "ignore";

type ProcOpts = {
  stdin?: StdioOption;
  stdout?: StdioOption;
  stderr?: StdioOption;
  env?: Record<string, string | undefined>;
};

type SpawnedProc = {
  exited: Promise<number>;
  stdout: Readable | null;
  stderr: Readable | null;
};

export function spawn(argv: readonly string[], opts: ProcOpts = {}): SpawnedProc {
  const proc = nodeSpawn(argv[0]!, argv.slice(1), {
    stdio: [opts.stdin ?? "inherit", opts.stdout ?? "inherit", opts.stderr ?? "inherit"],
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
  const exited = new Promise<number>((resolve) => {
    proc.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    proc.once("error", () => resolve(1));
  });
  return { exited, stdout: proc.stdout, stderr: proc.stderr };
}

const streamText = (stream: Readable | null): Promise<string> =>
  stream ? (text(stream) as Promise<string>) : Promise.resolve("");

export async function run(
  argv: readonly string[],
  opts: { stdin?: StdioOption; env?: Record<string, string | undefined> } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = spawn(argv, {
    stdin: opts.stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { FORCE_COLOR: "0", NO_COLOR: "1", ...opts.env },
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    streamText(proc.stdout),
    streamText(proc.stderr),
  ]);
  return { code, stdout, stderr };
}
