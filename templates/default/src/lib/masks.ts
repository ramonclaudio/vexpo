import { USERNAME_MAX_LENGTH } from "@/convex/constants";

export function maskOtp(text: string): string {
  "worklet";
  return text.replace(/\D/g, "").slice(0, 6);
}

export function maskUsername(text: string): string {
  "worklet";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}
