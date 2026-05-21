import { ConvexError } from "convex/values";

import { ErrorText } from "./status-text";

/**
 * Pull a human-readable message out of an unknown thrown value. Knows about
 * `ConvexError`'s structured `data` payload (`{ code, message, field? }` from
 * `convex/errors.ts`) so server-side validation errors and auth failures
 * surface their original message instead of a stringified object.
 */
export function formatError(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "object" && data !== null && "message" in data) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === "string" && msg.length > 0) return msg;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred";
}

/**
 * Render an unknown thrown value through `ErrorText`. Returns null when there
 * is no error so call sites can do `<ConvexErrorView error={state.error} />`
 * unconditionally.
 */
export function ConvexErrorView({ error }: { error: unknown }) {
  if (error === undefined || error === null) return null;
  return <ErrorText>{formatError(error)}</ErrorText>;
}
