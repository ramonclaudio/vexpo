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

import { ascStatus, type AscStatus } from "../../src/lib/eas-integrations.ts";
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
