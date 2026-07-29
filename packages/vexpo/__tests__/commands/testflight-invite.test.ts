/**
 * Two Apple rules discovered on a live run, encoded as behavior: internal
 * groups only accept App Store Connect team members (outside emails fall
 * through to the external group when the group was auto-resolved), and the
 * invitation email can't send until the group has an installable build (the
 * tester is durably added, so that's a success with a note, not a failure).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AscApiError } from "../../src/lib/asc-api.ts";

const tf = {
  betaGroups: {
    list: vi.fn(),
    listTesters: vi.fn(async () => []),
    addTesters: vi.fn(async () => undefined),
  },
  betaTesters: {
    list: vi.fn(async () => []),
    create: vi.fn(),
  },
  betaTesterInvitations: {
    create: vi.fn(async () => ({ id: "inv-1", type: "betaTesterInvitations", attributes: {} })),
  },
};

vi.mock("../../src/lib/asc-state.ts", () => ({
  ascBootstrap: vi.fn(async () => ({ client: {}, ascAppId: "app-1", bundleId: "com.acme.app" })),
}));
vi.mock("../../src/lib/asc-testflight.ts", () => ({ testflight: () => tf }));

import { runTestflightInvite } from "../../src/commands/testflight.ts";

function ascError(status: number, code: string, detail: string) {
  return new AscApiError(status, JSON.stringify({ errors: [{ status, code, detail }] }));
}

const GROUPS = [
  { type: "betaGroups", id: "g-int", attributes: { name: "Internal", isInternalGroup: true } },
  { type: "betaGroups", id: "g-ext", attributes: { name: "Beta", isInternalGroup: false } },
];

beforeEach(() => {
  vi.clearAllMocks();
  tf.betaGroups.list.mockResolvedValue(GROUPS);
  tf.betaGroups.listTesters.mockResolvedValue([]);
  tf.betaTesters.list.mockResolvedValue([]);
  tf.betaTesters.create.mockResolvedValue({ id: "t-1", type: "betaTesters", attributes: {} });
  tf.betaTesterInvitations.create.mockResolvedValue({
    id: "inv-1",
    type: "betaTesterInvitations",
    attributes: {},
  });
});

describe("runTestflightInvite", () => {
  it("falls through to the external group when an outside email can't join internal", async () => {
    tf.betaTesters.create
      .mockRejectedValueOnce(ascError(409, "STATE_ERROR", "Tester(s) cannot be assigned"))
      .mockResolvedValueOnce({ id: "t-1", type: "betaTesters", attributes: {} });

    expect(await runTestflightInvite({ email: "outside@example.com" })).toBe(0);

    const groupIds = tf.betaTesters.create.mock.calls.map(
      (c) => (c[0] as { groupIds: string[] }).groupIds[0],
    );
    expect(groupIds).toEqual(["g-int", "g-ext"]);
  });

  it("does not silently reroute an explicit --group, but says why it failed", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    tf.betaTesters.create.mockRejectedValueOnce(
      ascError(409, "STATE_ERROR", "Tester(s) cannot be assigned"),
    );
    await expect(
      runTestflightInvite({ email: "outside@example.com", groupId: "g-int" }),
    ).rejects.toThrow(/cannot be assigned/);
    expect(tf.betaTesters.create).toHaveBeenCalledTimes(1);
    const out = stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toContain("internal groups only accept App Store Connect team members");
    stderr.mockRestore();
  });

  it("treats a pending-beta-review invitation as success, tester stays added", async () => {
    tf.betaTesterInvitations.create.mockRejectedValueOnce(
      ascError(409, "STATE_ERROR.TESTER_INVITE.NO_INSTALLABLE_BUILDS", "no installable build"),
    );
    expect(await runTestflightInvite({ email: "ray@example.com", groupId: "g-ext" })).toBe(0);
    expect(tf.betaTesters.create).toHaveBeenCalledTimes(1);
  });

  it("adds an existing tester to the group instead of recreating", async () => {
    tf.betaTesters.list.mockResolvedValue([
      { id: "t-9", type: "betaTesters", attributes: { email: "ray@example.com" } },
    ]);
    expect(await runTestflightInvite({ email: "ray@example.com", groupId: "g-ext" })).toBe(0);
    expect(tf.betaTesters.create).not.toHaveBeenCalled();
    expect(tf.betaGroups.addTesters).toHaveBeenCalledWith("g-ext", ["t-9"]);
  });

  it("skips the group add when the tester is already a member (re-add 409s)", async () => {
    tf.betaTesters.list.mockResolvedValue([
      { id: "t-9", type: "betaTesters", attributes: { email: "ray@example.com" } },
    ]);
    tf.betaGroups.listTesters.mockResolvedValue([
      { id: "t-9", type: "betaTesters", attributes: {} },
    ]);
    expect(await runTestflightInvite({ email: "ray@example.com", groupId: "g-ext" })).toBe(0);
    expect(tf.betaGroups.addTesters).not.toHaveBeenCalled();
  });
});
