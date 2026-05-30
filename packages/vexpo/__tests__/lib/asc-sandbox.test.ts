import { describe, expect, it, vi } from "vitest";

import { sandbox } from "../../src/lib/asc-sandbox.ts";
import type { AscClient } from "../../src/lib/asc-api.ts";

describe("sandbox create body", () => {
  it("sends the full ASC SandboxTesterCreateRequest attributes (not `territory`)", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ data: { type: "sandboxTesters", id: "1", attributes: {} } });
    const s = sandbox({ request } as unknown as AscClient);

    await s.sandboxTesters.create({
      email: "t@example.com",
      password: "pw123456",
      firstName: "A",
      lastName: "B",
      appStoreTerritory: "USA",
      secretQuestion: "Q?",
      secretAnswer: "ans",
      birthDate: "2000-01-01",
    });

    const [method, path, body] = request.mock.calls[0] as [
      string,
      string,
      { data: { attributes: Record<string, unknown> } },
    ];
    expect(method).toBe("POST");
    expect(path).toBe("/v1/sandboxTesters");
    const attrs = body.data.attributes;
    expect(attrs).toMatchObject({
      firstName: "A",
      lastName: "B",
      email: "t@example.com",
      password: "pw123456",
      confirmPassword: "pw123456",
      secretQuestion: "Q?",
      secretAnswer: "ans",
      birthDate: "2000-01-01",
      appStoreTerritory: "USA",
    });
    expect(attrs).not.toHaveProperty("territory");
  });
});
