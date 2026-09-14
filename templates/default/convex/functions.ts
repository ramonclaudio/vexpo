import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";

import { mutation, query } from "./_generated/server";
import { requireAuthenticatedUser, safeGetAuthenticatedUser } from "./auth";
import type { AuthUser } from "./auth";

export type { AuthUser };

export const optionalAuthQuery = customQuery(
  query,
  customCtx(async (ctx) => ({
    user: await safeGetAuthenticatedUser(ctx),
  })),
);

export const authMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({
    user: await requireAuthenticatedUser(ctx),
  })),
);
