import { useEffect, useState } from "react";
import { useNavigation } from "expo-router";

import { haptics } from "@/lib/haptics";

// Guards a dirty form: while `active`, a back/swipe is intercepted and parked in
// `pendingNavAction` so the paired DiscardChangesDialog can confirm before the
// input is lost. `discard` replays the parked action; `dismiss` keeps editing.
export function useUnsavedChanges(active: boolean) {
  const navigation = useNavigation();
  const [pendingNavAction, setPendingNavAction] = useState<
    Parameters<typeof navigation.dispatch>[0] | null
  >(null);

  useEffect(() => {
    if (!active) return;
    return navigation.addListener("beforeRemove", (e) => {
      e.preventDefault();
      setPendingNavAction(e.data.action);
    });
  }, [navigation, active]);

  const discard = () => {
    haptics.warning();
    const action = pendingNavAction;
    setPendingNavAction(null);
    if (action) navigation.dispatch(action);
  };
  const dismiss = () => setPendingNavAction(null);

  return { pendingNavAction, discard, dismiss };
}
