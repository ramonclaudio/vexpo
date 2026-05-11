/**
 * Custom Function Wrappers
 *
 * Authenticated query/mutation wrappers that inject the current user into
 * the context. Uses the centralized helpers from auth.ts to avoid duplication.
 */

import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";

import { mutation, query } from "./_generated/server";
import { requireAuthenticatedUser, safeGetAuthenticatedUser } from "./auth";
import type { AuthUser } from "./auth";

// Re-export AuthUser type for convenience
export type { AuthUser };

// ============================================================================
// Query Wrappers
// ============================================================================

/**
 * Authenticated query - throws ConvexError if user is not logged in.
 */
export const authQuery = customQuery(
  query,
  customCtx(async (ctx) => ({
    user: await requireAuthenticatedUser(ctx),
  })),
);

/**
 * Optional auth query - user may be undefined.
 * Use for endpoints that work for both authenticated and anonymous users.
 */
export const optionalAuthQuery = customQuery(
  query,
  customCtx(async (ctx) => ({
    user: await safeGetAuthenticatedUser(ctx),
  })),
);

// ============================================================================
// Mutation Wrappers
// ============================================================================

/**
 * Authenticated mutation - throws ConvexError if user is not logged in.
 */
export const authMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({
    user: await requireAuthenticatedUser(ctx),
  })),
);
