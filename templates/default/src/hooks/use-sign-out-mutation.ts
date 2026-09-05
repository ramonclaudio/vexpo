import { useCallback, useState } from "react";
import type { FunctionReference } from "convex/server";
import { useMutation } from "convex/react";

import { authClient } from "@/lib/auth-client";
import { formatError } from "@/lib/convex-error";
import { haptics } from "@/lib/haptics";

type Gate = () => Promise<{ ok: true } | { ok: false; error?: string }>;

/**
 * Runs a mutation that ends the session, then signs out. `gate` runs first and
 * can stop the whole thing, which is how the delete flow asks for Face ID.
 */
export function useSignOutMutation(
  mutation: FunctionReference<"mutation">,
  gate?: Gate,
): [() => Promise<void>, string | null] {
  const run = useMutation(mutation);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    haptics.error();
    if (gate) {
      const passed = await gate();
      if (!passed.ok) {
        if (passed.error) setError(passed.error);
        return;
      }
    }
    try {
      await run();
      await authClient.signOut();
    } catch (err) {
      haptics.error();
      setError(formatError(err));
    }
  }, [run, gate]);

  return [submit, error];
}
