import { createStorage, isBoolean, useStore } from "@/lib/storage";

const onboardingStore = createStorage("onboarding_seen", false, isBoolean);

export function useOnboarding() {
  return { seen: useStore(onboardingStore), markSeen: () => onboardingStore.set(true) };
}
