// Shared constants and pure helpers.
// Safe to import from Convex functions AND React routes.
// Do not add imports from `convex/server`, `./_generated/*`, or React here.

// ============================================================================
// Username validation (Better Auth `username` plugin)
// ============================================================================

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

// Alphanumerics, underscores, dots. Must match the server-side
// `usernameValidator` in convex/auth.ts to avoid client/server drift.
export const USERNAME_FORMAT_REGEX = /^[a-zA-Z0-9_.]+$/;

export const RESERVED_USERNAMES = [
  "admin",
  "administrator",
  "root",
  "system",
  "moderator",
  "mod",
  "support",
  "help",
  "info",
  "contact",
  "api",
  "www",
  "mail",
  "email",
  "test",
  "null",
  "undefined",
] as const;

export function isReservedUsername(username: string): boolean {
  return (RESERVED_USERNAMES as ReadonlyArray<string>).includes(username.toLowerCase());
}

export function isValidUsernameFormat(username: string): boolean {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_FORMAT_REGEX.test(username)
  );
}
