import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  firstError,
  firstErrorField,
  forgotPasswordSchema,
  profileUpdateSchema,
  resetPasswordSchema,
  signInEmailSchema,
  signInSchema,
  signInUsernameSchema,
  signUpSchema,
} from "@/lib/schemas";

// Validation behind the auth and profile forms. The screens render
// @expo/ui SwiftUI (which Maestro can't drive), so this is where the form
// logic is actually verified: transforms, bounds, format, reserved names,
// cross-field matching, and the inline-error helpers.

const validPassword = "a".repeat(PASSWORD_MIN_LENGTH);

describe("email validation", () => {
  it("trims and lowercases a valid email", () => {
    const r = forgotPasswordSchema.safeParse({ email: "  Foo@Bar.COM  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("foo@bar.com");
  });

  it("rejects a malformed email with the inline message", () => {
    const r = forgotPasswordSchema.safeParse({ email: "not-an-email" });
    expect(r.success).toBe(false);
    expect(firstError(r)).toBe("Enter a valid email address");
  });
});

describe("password bounds", () => {
  it(`rejects shorter than ${PASSWORD_MIN_LENGTH}`, () => {
    const r = signUpSchema.safeParse({
      name: "Ray",
      username: "",
      email: "r@example.com",
      password: "a".repeat(PASSWORD_MIN_LENGTH - 1),
    });
    expect(r.success).toBe(false);
    expect(firstError(r)).toBe(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  });

  it(`rejects longer than ${PASSWORD_MAX_LENGTH}`, () => {
    const r = signUpSchema.safeParse({
      name: "Ray",
      username: "",
      email: "r@example.com",
      password: "a".repeat(PASSWORD_MAX_LENGTH + 1),
    });
    expect(r.success).toBe(false);
    expect(firstError(r)).toBe(`Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`);
  });

  it("accepts a password at the minimum length", () => {
    const r = signUpSchema.safeParse({
      name: "Ray",
      username: "",
      email: "r@example.com",
      password: validPassword,
    });
    expect(r.success).toBe(true);
  });
});

describe("required username (profileUpdateSchema)", () => {
  it("lowercases and trims a valid username", () => {
    const r = profileUpdateSchema.safeParse({
      name: "Ray",
      username: "  RayC  ",
      email: "r@example.com",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.username).toBe("rayc");
  });

  it("rejects too-short usernames", () => {
    const r = profileUpdateSchema.safeParse({ name: "Ray", username: "ab", email: "r@example.com" });
    expect(r.success).toBe(false);
    expect(firstErrorField(r)).toBe("username");
  });

  it("rejects invalid characters with the format message", () => {
    const r = profileUpdateSchema.safeParse({
      name: "Ray",
      username: "bad name!",
      email: "r@example.com",
    });
    expect(firstError(r)).toBe("Letters, numbers, dots, and underscores only");
  });

  it("rejects a reserved username, case-insensitively", () => {
    const r = profileUpdateSchema.safeParse({
      name: "Ray",
      username: "ADMIN",
      email: "r@example.com",
    });
    expect(firstError(r)).toBe("That username is reserved");
  });

  it("rejects an empty username (required here, unlike sign-up)", () => {
    const r = profileUpdateSchema.safeParse({ name: "Ray", username: "", email: "r@example.com" });
    expect(r.success).toBe(false);
  });
});

describe("optional username (signUpSchema)", () => {
  it("accepts an empty username", () => {
    const r = signUpSchema.safeParse({
      name: "Ray",
      username: "",
      email: "r@example.com",
      password: validPassword,
    });
    expect(r.success).toBe(true);
  });

  it("still rejects a non-empty reserved username", () => {
    const r = signUpSchema.safeParse({
      name: "Ray",
      username: "root",
      email: "r@example.com",
      password: validPassword,
    });
    expect(firstError(r)).toBe("That username is reserved");
  });

  it("requires a non-empty name", () => {
    const r = signUpSchema.safeParse({
      name: "   ",
      username: "",
      email: "r@example.com",
      password: validPassword,
    });
    expect(r.success).toBe(false);
    expect(firstError(r)).toBe("Name is required");
  });
});

describe("sign-in schemas", () => {
  it("signInSchema requires identifier and password", () => {
    const r = signInSchema.safeParse({ identifier: "", password: "" });
    expect(r.success).toBe(false);
    expect(firstError(r)).toBe("Username or email is required");
  });

  it("signInEmailSchema validates the email but takes any non-empty password", () => {
    expect(signInEmailSchema.safeParse({ email: "r@example.com", password: "x" }).success).toBe(
      true,
    );
    expect(signInEmailSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(signInEmailSchema.safeParse({ email: "r@example.com", password: "" }).success).toBe(
      false,
    );
  });

  it("signInUsernameSchema enforces the username minimum", () => {
    expect(signInUsernameSchema.safeParse({ username: "ab", password: "x" }).success).toBe(false);
    expect(signInUsernameSchema.safeParse({ username: "abc", password: "x" }).success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  const base = { email: "r@example.com", otp: "123456", password: validPassword };

  it("rejects an OTP that is not 6 digits", () => {
    const r = resetPasswordSchema.safeParse({ ...base, otp: "12345", confirmPassword: validPassword });
    expect(r.success).toBe(false);
    expect(firstError(r)).toBe("Enter the 6-digit code");
  });

  it("rejects mismatched passwords, flagged on confirmPassword", () => {
    const r = resetPasswordSchema.safeParse({ ...base, confirmPassword: `${validPassword}x` });
    expect(r.success).toBe(false);
    expect(firstError(r)).toBe("Passwords do not match");
    expect(firstErrorField(r)).toBe("confirmPassword");
  });

  it("accepts a valid reset with matching passwords", () => {
    const r = resetPasswordSchema.safeParse({ ...base, confirmPassword: validPassword });
    expect(r.success).toBe(true);
  });
});

describe("error helpers", () => {
  it("firstError and firstErrorField return null on success", () => {
    const r = forgotPasswordSchema.safeParse({ email: "r@example.com" });
    expect(firstError(r)).toBeNull();
    expect(firstErrorField(r)).toBeNull();
  });
});
