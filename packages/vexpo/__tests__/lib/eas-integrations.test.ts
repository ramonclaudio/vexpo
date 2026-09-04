import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/proc.ts", () => ({
  run: vi.fn().mockResolvedValue({ code: 0, stdout: "{}", stderr: "" }),
  spawn: vi.fn(() => ({
    exited: Promise.resolve(0),
    stdout: null,
    stderr: null,
    stdin: null,
    pid: 1,
    kill: () => {},
  })),
}));

vi.mock("../../src/lib/pkg-manager.ts", () => ({
  dlx: () => "bunx",
}));

import { ascStatus, convexProjectLink, type AscStatus } from "../../src/lib/eas-integrations.ts";
import { run } from "../../src/lib/proc.ts";

const runSpy = run as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  runSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const disconnectedFixture: AscStatus = {
  action: "status",
  project: "@testuser/testapp",
  status: "not-connected",
};

const connectedFixture: AscStatus = {
  action: "status",
  project: "@testuser/testapp",
  status: "connected",
  appStoreConnectApp: {
    id: "asc-app-link-id",
    ascAppIdentifier: "1234567890",
    name: "Test App",
    bundleIdentifier: "com.test.app",
    appleUrl: "https://apps.apple.com/app/id1234567890",
  },
};

const invalidFixture: AscStatus = {
  action: "status",
  project: "test-project-id",
  status: "invalid",
};

describe("ascStatus", () => {
  it("spawns `eas integrations:asc:status --json --non-interactive`", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: JSON.stringify(disconnectedFixture), stderr: "" });
    await ascStatus();
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toEqual([
      "bunx",
      "eas-cli",
      "integrations:asc:status",
      "--json",
      "--non-interactive",
    ]);
  });

  it("parses a 'connected' response with the appStoreConnectApp payload", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: JSON.stringify(connectedFixture), stderr: "" });
    const status = await ascStatus();
    expect(status.status).toBe("connected");
    expect(status.appStoreConnectApp).toBeDefined();
    expect(status.appStoreConnectApp?.bundleIdentifier).toBe("com.test.app");
    expect(status.appStoreConnectApp?.ascAppIdentifier).toBe("1234567890");
    expect(status.appStoreConnectApp?.id).toBe("asc-app-link-id");
  });

  it("parses a 'not-connected' response (appStoreConnectApp absent)", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: JSON.stringify(disconnectedFixture), stderr: "" });
    const status = await ascStatus();
    expect(status.status).toBe("not-connected");
    expect(status.appStoreConnectApp).toBeUndefined();
  });

  it("parses an 'invalid' response (appStoreConnectApp absent)", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: JSON.stringify(invalidFixture), stderr: "" });
    const status = await ascStatus();
    expect(status.status).toBe("invalid");
    expect(status.appStoreConnectApp).toBeUndefined();
  });
});

const BOLD_ON = "\u001b[1m";
const BOLD_OFF = "\u001b[22m";

const linkedOutput = [
  `${BOLD_ON}Convex project linked to acme${BOLD_OFF}`,
  `${BOLD_ON}Name${BOLD_OFF}: acme`,
  `${BOLD_ON}Slug${BOLD_OFF}: acme-1a2b3`,
  `${BOLD_ON}Identifier${BOLD_OFF}: 42`,
  `${BOLD_ON}Team${BOLD_OFF}: Acme / acme-team`,
  `${BOLD_ON}Dashboard${BOLD_OFF}: https://dashboard.convex.dev/t/acme-team/acme-1a2b3`,
].join("\n");

describe("convexProjectLink", () => {
  it("spawns `eas integrations:convex:project` without --json", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: "No Convex project is linked", stderr: "" });
    await convexProjectLink();
    expect(runSpy.mock.calls[0]?.[0]).toEqual(["bunx", "eas-cli", "integrations:convex:project"]);
  });

  it("returns null when no project is linked", async () => {
    runSpy.mockResolvedValue({
      code: 0,
      stdout: "",
      stderr: "No Convex project is linked to Expo app acme on EAS.",
    });
    expect(await convexProjectLink()).toBeNull();
  });

  it("reads the name and dashboard through the ANSI codes", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: linkedOutput, stderr: "" });
    expect(await convexProjectLink()).toEqual({
      name: "acme",
      dashboard: "https://dashboard.convex.dev/t/acme-team/acme-1a2b3",
    });
  });

  it("throws with the last line when eas exits non-zero", async () => {
    runSpy.mockResolvedValue({ code: 1, stdout: "", stderr: "Error: not logged in" });
    await expect(convexProjectLink()).rejects.toThrow("not logged in");
  });

  it("points at `eas init` when the app is not linked to EAS", async () => {
    runSpy.mockResolvedValue({
      code: 1,
      stdout: "",
      stderr: "EAS project not configured.\nInput is required, but stdin is not readable.",
    });
    await expect(convexProjectLink()).rejects.toThrow("npx eas-cli init");
  });

  it("throws when the output has no Name line", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: "Convex project linked to acme", stderr: "" });
    await expect(convexProjectLink()).rejects.toThrow("could not read the Convex project");
  });
});
