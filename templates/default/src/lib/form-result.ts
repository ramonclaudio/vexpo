import { announce } from "@/lib/a11y";
import { haptics } from "@/lib/haptics";

export const UNEXPECTED_ERROR = "An unexpected error occurred. Please try again.";

// Every form action ends one of two ways, and each way pairs a buzz with
// something for VoiceOver to read. Going through these keeps the two in step.
export function fail(error: string, attempt?: number): { error: string; attempt?: number } {
  haptics.error();
  return { error, attempt };
}

export function succeed(announcement: string): void {
  haptics.success();
  announce(announcement);
}
