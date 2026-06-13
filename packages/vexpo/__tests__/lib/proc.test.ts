import { describe, expect, it } from "vitest";
describe("run color suppression", () => {
  it("forces color off for parsed children even when the parent shell sets FORCE_COLOR", async () => {
    const prev = process.env.FORCE_COLOR;
    process.env.FORCE_COLOR = "1";
    try {
      const { run } = await import("../../src/lib/proc.ts");
      const { stdout } = await run([
        "node",
        "-e",
        "process.stdout.write(`${process.env.FORCE_COLOR}|${process.env.NO_COLOR}`)",
      ]);
      expect(stdout).toBe("0|1");
    } finally {
      if (prev === undefined) delete process.env.FORCE_COLOR;
      else process.env.FORCE_COLOR = prev;
    }
  });

  it("lets an explicit opts.env override the suppression", async () => {
    const { run } = await import("../../src/lib/proc.ts");
    const { stdout } = await run(
      ["node", "-e", "process.stdout.write(String(process.env.FORCE_COLOR))"],
      { env: { FORCE_COLOR: "1" } },
    );
    expect(stdout).toBe("1");
  });
});
