import { useCallback, useState } from "react";
import type { FunctionReference } from "convex/server";
import { useMutation } from "convex/react";

import { authClient } from "@/lib/auth-client";
import { formatError } from "@/lib/convex-error";
import { fail } from "@/lib/form-result";

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
    const raise = (message: string) => setError(fail(message).error);
    setError(null);
    if (gate) {
      const passed = await gate();
      if (!passed.ok) {
        if (passed.error) raise(passed.error);
        return;
      }
    }
    try {
      await run();
      await authClient.signOut();
    } catch (err) {
      raise(formatError(err));
    }
  }, [run, gate]);

  return [submit, error];
}
