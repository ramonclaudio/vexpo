import { useSyncExternalStore } from "react";

import { createStorage } from "@/lib/storage";

const onboardingStore = createStorage<boolean>("onboarding_seen", false);

export function useOnboarding() {
  const seen = useSyncExternalStore(
    onboardingStore.subscribe,
    onboardingStore.get,
    onboardingStore.get,
  );

  const markSeen = () => onboardingStore.set(true);

  return { seen, markSeen };
}
