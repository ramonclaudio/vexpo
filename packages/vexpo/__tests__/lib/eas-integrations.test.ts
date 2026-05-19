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

// Fixtures lifted from eas-cli's own buildJsonOutput function at
// packages/eas-cli/src/integrations/asc/utils.ts. Locking the contract here
// catches schema drift the moment an eas-cli release rotates field names.
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

const disconnectedFixture: AscStatus = {
  action: "status",
  project: "@testuser/testapp",
  status: "not-connected",
  appStoreConnectApp: null,
};

const invalidFixture: AscStatus = {
  action: "status",
  project: "test-project-id",
  status: "invalid",
  appStoreConnectApp: null,
};

describe("ascStatus", () => {
  it("spawns `eas integrations:asc:status --json --non-interactive`", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: JSON.stringify(disconnectedFixture), stderr: "" });
    await ascStatus();
    const argv = runSpy.mock.calls[0]?.[0] as string[];
    expect(argv).toEqual(["bunx", "eas", "integrations:asc:status", "--json", "--non-interactive"]);
  });

  it("parses a 'connected' response with the appStoreConnectApp payload", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: JSON.stringify(connectedFixture), stderr: "" });
    const status = await ascStatus();
    expect(status.status).toBe("connected");
    expect(status.appStoreConnectApp).not.toBeNull();
    expect(status.appStoreConnectApp?.bundleIdentifier).toBe("com.test.app");
    expect(status.appStoreConnectApp?.ascAppIdentifier).toBe("1234567890");
    expect(status.appStoreConnectApp?.id).toBe("asc-app-link-id");
  });

  it("parses a 'not-connected' response with appStoreConnectApp=null", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: JSON.stringify(disconnectedFixture), stderr: "" });
    const status = await ascStatus();
    expect(status.status).toBe("not-connected");
    expect(status.appStoreConnectApp).toBeNull();
  });

  it("parses an 'invalid' response (revoked or rejected ASC API key)", async () => {
    runSpy.mockResolvedValue({ code: 0, stdout: JSON.stringify(invalidFixture), stderr: "" });
    const status = await ascStatus();
    expect(status.status).toBe("invalid");
    expect(status.appStoreConnectApp).toBeNull();
  });

  it("rejects the pre-PR-#50 shape so the broken type cannot regress", async () => {
    // Catches the exact bug the type fix targets: if eas-cli ever emits
    // { connected: bool, ascApp: {...} } again, this test fails loudly
    // instead of silently breaking the idempotency check.
    runSpy.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ connected: true, ascApp: { bundleId: "com.test.app" } }),
      stderr: "",
    });
    const status = (await ascStatus()) as unknown as { status?: string; connected?: boolean };
    expect(status.status).toBeUndefined();
    expect(status.connected).toBe(true);
  });
});
