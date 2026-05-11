/**
 * Validator Utilities
 *
 * Function argument and return-type validators.
 * Schema-level field validators live in schema.ts.
 */

import { literals } from "convex-helpers/validators";
import { v } from "convex/values";

/**
 * Paginated response structure.
 * Spread into a v.object() alongside the page shape.
 */
export const paginatedResponseFields = {
  continueCursor: v.string(),
  isDone: v.boolean(),
};

// ============================================================================
// User Profile Validators
// ============================================================================

/**
 * User profile fields accepted by updateProfile.
 * Name changes go through Better Auth (authClient.updateUser) directly.
 */
export const userProfileUpdateFields = {
  bio: v.optional(v.string()),
};

/**
 * Public user profile returned by api.users.getUser and in listUsers pages.
 * Merges app-owned fields (bio, avatar storage resolved to URL) with Better
 * Auth identity fields (name, username).
 */
export const publicUserProfileValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  name: v.string(),
  username: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  bio: v.optional(v.string()),
});

/**
 * Paginated user list response.
 */
export const paginatedUsersValidator = v.object({
  page: v.array(publicUserProfileValidator),
  ...paginatedResponseFields,
});

// ============================================================================
// Mobile Validators
// ============================================================================

export const deviceTypeValidator = literals("ios");

// ============================================================================
// Validation Helpers
// ============================================================================

const BIO_MAX_LENGTH = 500;

/**
 * Validate a bio field.
 */
export function validateBio(bio: string): { valid: boolean; error?: string } {
  if (bio.length > BIO_MAX_LENGTH) {
    return { valid: false, error: `Bio must be ${BIO_MAX_LENGTH} characters or less` };
  }
  return { valid: true };
}
