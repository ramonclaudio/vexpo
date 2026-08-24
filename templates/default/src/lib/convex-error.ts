import { ConvexError } from "convex/values";

export function formatError(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "object" && data !== null && "message" in data) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === "string" && msg.length > 0) return msg;
    }
    return err.message;
  }
  // Anything that is not a ConvexError came from the transport, not from us:
  // "Network request failed", a JSON parse error, a raw stack. Those are
  // internal strings, so none of them go on screen. Callers that can say
  // something more useful should throw a ConvexError with a message.
  return "Something went wrong. Please try again.";
}
