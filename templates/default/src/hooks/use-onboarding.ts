import { useSyncExternalStore } from "react";

import { createStorage, isBoolean } from "@/lib/storage";

const onboardingStore = createStorage("onboarding_seen", false, isBoolean);

export function useOnboarding() {
  const seen = useSyncExternalStore(
    onboardingStore.subscribe,
    onboardingStore.get,
    onboardingStore.get,
  );

  const markSeen = () => onboardingStore.set(true);

  return { seen, markSeen };
}
