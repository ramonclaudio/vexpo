import { literals } from "convex-helpers/validators";
import { v } from "convex/values";

export const paginatedResponseFields = {
  continueCursor: v.string(),
  isDone: v.boolean(),
};

// Name changes go through Better Auth (authClient.updateUser) directly.
export const userProfileUpdateFields = {
  bio: v.optional(v.string()),
};

export const publicUserProfileValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  name: v.string(),
  username: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  bio: v.optional(v.string()),
});

export const paginatedUsersValidator = v.object({
  page: v.array(publicUserProfileValidator),
  ...paginatedResponseFields,
});

export const deviceTypeValidator = literals("ios");

const BIO_MAX_LENGTH = 500;

export function validateBio(bio: string): { valid: boolean; error?: string } {
  if (bio.length > BIO_MAX_LENGTH) {
    return { valid: false, error: `Bio must be ${BIO_MAX_LENGTH} characters or less` };
  }
  return { valid: true };
}
