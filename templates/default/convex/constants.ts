export const GUEST_NAME = "Guest";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

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
