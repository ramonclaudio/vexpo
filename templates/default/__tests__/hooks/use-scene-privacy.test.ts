import { describe, expect, it, vi } from "vitest";

// The hook's import chain pulls in react-native, which the node test env
// can't parse. Stub the native-touching imports so the module loads and we
// can exercise the pure state-to-modifiers helper.
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: vi.fn() },
}));
vi.mock("@expo/ui/swift-ui/modifiers", () => ({
  redacted: (reasons: unknown) => ({ $type: "redacted", reasons }),
}));

const { privacyModifiers } = await import("@/hooks/use-scene-privacy");

// The shield must be inert while the app is frontmost and raise the privacy
// reason for both resign states: "inactive" (app switcher) and "background".
describe("privacyModifiers", () => {
  it("applies no redaction while active", () => {
    expect(privacyModifiers("active")).toEqual([]);
  });

  it("raises the privacy reason when the app resigns", () => {
    expect(privacyModifiers("inactive")).toEqual([{ $type: "redacted", reasons: "privacy" }]);
    expect(privacyModifiers("background")).toEqual([{ $type: "redacted", reasons: "privacy" }]);
  });
});
