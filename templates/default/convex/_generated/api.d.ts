/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as apple from "../apple.js";
import type * as auth from "../auth.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as env from "../env.js";
import type * as errors from "../errors.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as log from "../log.js";
import type * as pushTokens from "../pushTokens.js";
import type * as rateLimit from "../rateLimit.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";
import type * as webhook from "../webhook.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  apple: typeof apple;
  auth: typeof auth;
  constants: typeof constants;
  crons: typeof crons;
  email: typeof email;
  env: typeof env;
  errors: typeof errors;
  functions: typeof functions;
  http: typeof http;
  log: typeof log;
  pushTokens: typeof pushTokens;
  rateLimit: typeof rateLimit;
  users: typeof users;
  validators: typeof validators;
  webhook: typeof webhook;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
