import { api } from "@/convex/_generated/api";
import { useSignOutMutation } from "@/hooks/use-sign-out-mutation";

export function useDiscardGuest() {
  const [discardGuest, discardError] = useSignOutMutation(api.users.discardGuest);
  return { discardGuest, discardError };
}
