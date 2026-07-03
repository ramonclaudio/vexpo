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

// Same rules as `usernameSchema`, but an empty field is allowed (accounts can
// exist without a username). Trim and lowercase first so a whitespace-only
// entry collapses to "" and passes, then require either "" or a valid username.
const optionalUsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.literal("").or(usernameSchema));

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

// Accounts can exist without a username (the column is nullable), and the
// profile field shows "" for them. The strict `usernameSchema` rejects ""
// (min length 3), which would block those users from saving name/email/bio
// they never touched. This variant accepts "" so the username stays untouched
// while the other fields update, mirroring how `signUpSchema` treats it.
export const profileUpdateOptionalUsernameSchema = z.object({
  name: nameSchema,
  username: optionalUsernameSchema,
  email: emailSchema,
});

export function firstError(
  result: { success: false; error: z.ZodError } | { success: true; data: unknown },
): string | null {
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Invalid input";
}

export function firstErrorField(
  result: { success: false; error: z.ZodError } | { success: true; data: unknown },
): string | null {
  if (result.success) return null;
  const first = result.error.issues[0]?.path[0];
  return typeof first === "string" ? first : null;
}
