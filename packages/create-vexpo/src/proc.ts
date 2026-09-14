import { spawn } from "node:child_process";

type Stdio = "inherit" | "pipe" | "ignore";

type RunResult = { code: number; stdout: string; stderr: string };

export function run(
  argv: readonly string[],
  opts: { cwd: string; stdio?: Stdio },
): Promise<RunResult> {
  const stdio = opts.stdio ?? "pipe";
  const proc = spawn(argv[0], argv.slice(1), {
    cwd: opts.cwd,
    stdio: stdio === "inherit" ? "inherit" : ["ignore", stdio, stdio],
  });

  let stdout = "";
  let stderr = "";
  proc.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
  proc.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));

  return new Promise((resolve) => {
    const settle = (code: number) => resolve({ code, stdout, stderr });
    proc.once("close", (code, signal) => settle(code ?? (signal ? 1 : 0)));
    proc.once("error", () => settle(1));
  });
}
