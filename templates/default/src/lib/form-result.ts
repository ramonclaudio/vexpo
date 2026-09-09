import { announce } from "@/lib/a11y";
import { haptics } from "@/lib/haptics";

export const UNEXPECTED_ERROR = "An unexpected error occurred. Please try again.";

export function fail(error: string): { error: string } {
  haptics.error();
  announce(`Error: ${error}`);
  return { error };
}

export function succeed(announcement: string): void {
  haptics.success();
  announce(announcement);
}
