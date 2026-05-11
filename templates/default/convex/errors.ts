/**
 * Structured Errors
 *
 * Error factories emit ConvexError with a stable code so clients can
 * branch on `error.data.code` without parsing messages.
 */

import { ConvexError } from "convex/values";

export const ErrorCode = {
  UNAUTHENTICATED: "AUTH_1001",
  VALIDATION_ERROR: "VAL_3001",
} as const;

type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

type AppErrorData = {
  code: ErrorCodeValue;
  message: string;
  field?: string;
};

function createError(code: ErrorCodeValue, message: string, options?: { field?: string }) {
  return new ConvexError({ code, message, ...options } as AppErrorData);
}

export function authenticationRequired(message = "Authentication required") {
  return createError(ErrorCode.UNAUTHENTICATED, message);
}

export function validationError(message: string, field?: string) {
  return createError(ErrorCode.VALIDATION_ERROR, message, { field });
}
