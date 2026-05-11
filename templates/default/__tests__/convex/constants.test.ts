import { describe, expect, test } from "vitest";

import {
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isReservedUsername,
  isValidUsernameFormat,
} from "@/convex/constants";

describe("isValidUsernameFormat", () => {
  test("accepts alphanumerics, dots, underscores", () => {
    expect(isValidUsernameFormat("ray")).toBe(true);
    expect(isValidUsernameFormat("ray_claudio")).toBe(true);
    expect(isValidUsernameFormat("ray.claudio")).toBe(true);
    expect(isValidUsernameFormat("Ray123")).toBe(true);
  });

  test("rejects strings shorter than the min length", () => {
    expect(USERNAME_MIN_LENGTH).toBe(3);
    expect(isValidUsernameFormat("ab")).toBe(false);
  });

  test("rejects strings longer than the max length", () => {
    expect(USERNAME_MAX_LENGTH).toBe(30);
    expect(isValidUsernameFormat("a".repeat(31))).toBe(false);
  });

  test("rejects characters outside the allowed set", () => {
    expect(isValidUsernameFormat("ray-claudio")).toBe(false);
    expect(isValidUsernameFormat("ray claudio")).toBe(false);
    expect(isValidUsernameFormat("ray@claudio")).toBe(false);
    expect(isValidUsernameFormat("rayé")).toBe(false);
  });
});

describe("isReservedUsername", () => {
  test("matches every name on the reserved list, case-insensitive", () => {
    for (const name of RESERVED_USERNAMES) {
      expect(isReservedUsername(name)).toBe(true);
      expect(isReservedUsername(name.toUpperCase())).toBe(true);
    }
  });

  test("does not match a normal username", () => {
    expect(isReservedUsername("ray")).toBe(false);
    expect(isReservedUsername("ramon")).toBe(false);
  });
});
