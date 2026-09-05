import { announce } from "@/lib/a11y";
import { haptics } from "@/lib/haptics";

export const UNEXPECTED_ERROR = "An unexpected error occurred. Please try again.";

// Every form action ends one of two ways, and each way pairs a buzz with
// something for VoiceOver to read. Announcing here rather than from the row
// that renders the message is what makes a repeat announce: the same wrong
// password twice is one state change and two calls through here.
export function fail(error: string): { error: string } {
  haptics.error();
  announce(`Error: ${error}`);
  return { error };
}

export function succeed(announcement: string): void {
  haptics.success();
  announce(announcement);
}
