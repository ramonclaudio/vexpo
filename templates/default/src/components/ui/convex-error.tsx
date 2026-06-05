import { ConvexError } from "convex/values";

import { ErrorText } from "./status-text";

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

export function ConvexErrorView({ error, testID }: { error: unknown; testID?: string }) {
  if (error === undefined || error === null) return null;
  return <ErrorText testID={testID}>{formatError(error)}</ErrorText>;
}
