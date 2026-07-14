import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deploymentRefFromDeployKey,
  envMap,
  envSet,
  envSetFromFile,
} from "../../src/lib/convex-env.ts";

vi.mock("../../src/lib/proc.ts", () => ({
  run: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
}));

vi.mock("../../src/lib/pkg-manager.ts", () => ({
  dlx: () => "bunx",
}));

import { run } from "../../src/lib/proc.ts";

const runSpy = run as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  runSpy.mockReset();
  runSpy.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
});

afterEach(() => {
  delete process.env.CONVEX_DEPLOYMENT;
});

describe("envSetFromFile", () => {
  it("appends --force when opts.force is true", async () => {
    await envSetFromFile("/tmp/env.txt", undefined, { force: true });
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toContain("--force");
    expect(argv).toContain("--from-file");
    expect(argv).toContain("/tmp/env.txt");
  });

  it("omits --force when opts.force is false or absent", async () => {
    await envSetFromFile("/tmp/env.txt");
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).not.toContain("--force");
  });

  it("targets prod via --prod when target.prod is set", async () => {
    await envSetFromFile("/tmp/env.txt", { prod: true }, { force: true });
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toContain("--prod");
    expect(argv).not.toContain("--deployment");
  });

  it("targets a named deployment via --deployment", async () => {
    await envSetFromFile("/tmp/env.txt", { deployment: "happy-frog-12" });
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toContain("--deployment");
    expect(argv).toContain("happy-frog-12");
  });

  // The flag resolves through the platform API, which needs the user's login,
  // so passing it for the ambient deployment breaks deploy-key auth on
  // integration-created deployments. Flagless, the convex CLI reads
  // CONVEX_DEPLOYMENT / CONVEX_DEPLOY_KEY from .env.local itself.
  it("never passes --deployment for the ambient CONVEX_DEPLOYMENT", async () => {
    process.env.CONVEX_DEPLOYMENT = "dev:happy-frog-12";
    await envSetFromFile("/tmp/env.txt");
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).not.toContain("--deployment");
  });

  it("throws with stderr tail when convex CLI fails", async () => {
    runSpy.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "Use --force to overwrite existing values.",
    });
    await expect(envSetFromFile("/tmp/env.txt")).rejects.toThrow(
      /Use --force to overwrite existing values/,
    );
  });
});

describe("deploymentRefFromDeployKey", () => {
  it("recovers the deployment ref from a dev deploy key", () => {
    expect(deploymentRefFromDeployKey("dev:quick-fox-123|eyJ2MiI6IjAxIn0=")).toBe(
      "dev:quick-fox-123",
    );
  });

  it("recovers a prod ref", () => {
    expect(deploymentRefFromDeployKey("prod:brave-otter-42|token")).toBe("prod:brave-otter-42");
  });

  it("returns undefined for project-scoped keys, which name no deployment", () => {
    expect(deploymentRefFromDeployKey("project:acme:my-app|token")).toBeUndefined();
  });

  it("returns undefined for malformed or missing values", () => {
    expect(deploymentRefFromDeployKey("dev:no-token-part")).toBeUndefined();
    expect(deploymentRefFromDeployKey("eyJ2MiI6IjAxIn0=")).toBeUndefined();
    expect(deploymentRefFromDeployKey(undefined)).toBeUndefined();
  });
});

describe("envMap", () => {
  it("returns null on a non-zero exit so failure is distinct from empty", async () => {
    runSpy.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "not logged in" });
    expect(await envMap()).toBeNull();
  });

  it("returns an empty map (not null) when the deployment genuinely has no env", async () => {
    runSpy.mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" });
    const m = await envMap();
    expect(m).not.toBeNull();
    expect(m?.size).toBe(0);
  });

  it("parses key=value lines from convex env list", async () => {
    runSpy.mockResolvedValueOnce({
      code: 0,
      stdout: "APP_NAME=Vexpo\nSITE_URL=app://\n",
      stderr: "",
    });
    const m = await envMap();
    expect(m?.get("APP_NAME")).toBe("Vexpo");
    expect(m?.get("SITE_URL")).toBe("app://");
  });
});

describe("envSet", () => {
  it("routes the value through --from-file, never argv, so secrets stay off the process table", async () => {
    await envSet("APPLE_TEAM_ID", "ABCDE12345", { prod: true });
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toContain("set");
    expect(argv).toContain("--from-file");
    expect(argv).toContain("--prod");
    expect(argv).not.toContain("ABCDE12345");
  });

  // Mirrors dotenv@16's parse, which is what `convex env set --from-file` runs
  // on the written file: outer quotes strip, ONLY double quotes expand \n/\r,
  // single/backtick-quoted values stay fully literal.
  function dotenvParse(src: string): Map<string, string> {
    const LINE =
      /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;
    const out = new Map<string, string>();
    for (const m of src.matchAll(LINE)) {
      let v = (m[2] ?? "").trim();
      const q = v[0];
      v = v.replace(/^(['"`])([\s\S]*)\1$/gm, "$2");
      if (q === '"') v = v.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      out.set(m[1] as string, v);
    }
    return out;
  }

  async function writtenFor(value: string): Promise<string> {
    let written = "";
    runSpy.mockImplementationOnce(async (argv: string[]) => {
      const i = argv.indexOf("--from-file");
      const { readFileSync } = await import("node:fs");
      written = readFileSync(argv[i + 1] as string, "utf8");
      return { code: 0, stdout: "", stderr: "" };
    });
    await envSet("MY_SECRET", value);
    return written;
  }

  it("single-quotes a real-newline value so dotenv reads it back literally", async () => {
    const value = "line1\nline2";
    const written = await writtenFor(value);
    expect(written).toBe(`MY_SECRET='line1\nline2'\n`);
    expect(dotenvParse(written).get("MY_SECRET")).toBe(value);
  });

  it("keeps a literal backslash-n sequence out of double quotes, where dotenv would expand it", async () => {
    const value = 'pem#"-----BEGIN-----\\nMIIabc\\n-----END-----"';
    const written = await writtenFor(value);
    expect(written).toBe(`MY_SECRET='${value}'\n`);
    expect(dotenvParse(written).get("MY_SECRET")).toBe(value);
  });

  it("falls back to backticks when the value holds a single quote", async () => {
    const value = "it's\nfine";
    const written = await writtenFor(value);
    expect(written).toBe(`MY_SECRET=\`${value}\`\n`);
    expect(dotenvParse(written).get("MY_SECRET")).toBe(value);
  });

  it("double-quotes only when both literal quote forms are taken and expansion is safe", async () => {
    const value = "a'b`c\nd";
    const written = await writtenFor(value);
    expect(written).toBe(`MY_SECRET="a'b\`c\\nd"\n`);
    expect(dotenvParse(written).get("MY_SECRET")).toBe(value);
  });

  it("fails loud on a value no dotenv quote form can represent", async () => {
    await expect(envSet("MY_SECRET", "a'b`c\"d\\ne")).rejects.toThrow(/dotenv cannot represent/);
  });
});
