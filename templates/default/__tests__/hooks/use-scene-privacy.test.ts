import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: vi.fn() },
}));
vi.mock("@expo/ui/swift-ui/modifiers", () => ({
  redacted: (reasons: unknown) => ({ $type: "redacted", reasons }),
}));

const { privacyModifiers } = await import("@/hooks/use-scene-privacy");

describe("privacyModifiers", () => {
  it("applies no redaction while active", () => {
    expect(privacyModifiers("active")).toEqual([]);
  });

  it("raises the privacy reason when the app resigns", () => {
    expect(privacyModifiers("inactive")).toEqual([{ $type: "redacted", reasons: "privacy" }]);
    expect(privacyModifiers("background")).toEqual([{ $type: "redacted", reasons: "privacy" }]);
  });
});
