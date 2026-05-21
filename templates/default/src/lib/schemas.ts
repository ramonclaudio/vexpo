/**
 * Form validation schemas.
 *
 * Each form parses raw input via `schema.safeParse(values)` inside
 * `useActionState`. Errors flatten to inline `Section.footer` text under each
 * field. Constants and reserved-name helpers come from `@/convex/constants`
 * to keep client/server in sync.
 */

import { z } from "zod";

import {
  USERNAME_FORMAT_REGEX,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isReservedUsername,
} from "@/convex/constants";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH, {
    error: `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
  })
  .max(USERNAME_MAX_LENGTH, {
    error: `Username must be ${USERNAME_MAX_LENGTH} characters or fewer`,
  })
  .regex(USERNAME_FORMAT_REGEX, { error: "Letters, numbers, dots, and underscores only" })
  .refine((value) => !isReservedUsername(value), { error: "That username is reserved" });

// Optional variant used at sign-up: empty string is valid (the user can pick
// a handle later from the profile screen). Format and reserved checks only
// apply when the user actually typed something.
const optionalUsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => value === "" || value.length >= USERNAME_MIN_LENGTH, {
    error: `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
  })
  .refine((value) => value === "" || value.length <= USERNAME_MAX_LENGTH, {
    error: `Username must be ${USERNAME_MAX_LENGTH} characters or fewer`,
  })
  .refine((value) => value === "" || USERNAME_FORMAT_REGEX.test(value), {
    error: "Letters, numbers, dots, and underscores only",
  })
  .refine((value) => value === "" || !isReservedUsername(value), {
    error: "That username is reserved",
  });

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`,
  });

const emailSchema = z.string().trim().toLowerCase().email({ error: "Enter a valid email address" });

const nameSchema = z.string().trim().min(1, { error: "Name is required" });

const otpSchema = z.string().regex(/^\d{6}$/, { error: "Enter the 6-digit code" });

export const signInSchema = z.object({
  identifier: z.string().trim().min(1, { error: "Username or email is required" }),
  password: z.string().min(1, { error: "Password is required" }),
});

export const signInEmailSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Password is required" }),
});

export const signInUsernameSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(USERNAME_MIN_LENGTH, {
      error: `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
    }),
  password: z.string().min(1, { error: "Password is required" }),
});

export const signUpSchema = z.object({
  name: nameSchema,
  username: optionalUsernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    otp: otpSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const profileUpdateSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  email: emailSchema,
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignInEmailValues = z.infer<typeof signInEmailSchema>;
export type SignInUsernameValues = z.infer<typeof signInUsernameSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type ProfileUpdateValues = z.infer<typeof profileUpdateSchema>;

/**
 * Extract the first error message from a zod safeParse result, formatted for
 * inline display. Returns `null` if validation succeeded.
 */
export function firstError(
  result: { success: false; error: z.ZodError } | { success: true; data: unknown },
): string | null {
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Invalid input";
}

/**
 * Top-level field key of the first validation issue. Pair with `scrollPosition`
 * and `id('field-<key>')` to auto-scroll the form to the failing field.
 */
export function firstErrorField(
  result: { success: false; error: z.ZodError } | { success: true; data: unknown },
): string | null {
  if (result.success) return null;
  const first = result.error.issues[0]?.path[0];
  return typeof first === "string" ? first : null;
}
