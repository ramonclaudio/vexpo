import { describe, expect, test } from "vitest";

import { validateBio } from "@/convex/validators";

describe("validateBio", () => {
  test("accepts empty string", () => {
    expect(validateBio("")).toEqual({ valid: true });
  });

  test("accepts a normal bio", () => {
    expect(validateBio("Building things on the internet.")).toEqual({ valid: true });
  });

  test("accepts exactly 500 characters", () => {
    expect(validateBio("a".repeat(500))).toEqual({ valid: true });
  });

  test("rejects bios over 500 characters", () => {
    const result = validateBio("a".repeat(501));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/500 characters or less/);
  });
});
