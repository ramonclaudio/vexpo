import { ConvexError } from "convex/values";

export function formatError(err: unknown): string {
  if (!(err instanceof ConvexError)) return "Something went wrong. Please try again.";
  const data: unknown = err.data;
  if (typeof data === "object" && data !== null && "message" in data) {
    const message = data.message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return err.message;
}
