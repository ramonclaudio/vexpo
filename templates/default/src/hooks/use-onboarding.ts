import "expo-sqlite/localStorage/install";
import { useState } from "react";

const ONBOARDING_KEY = "onboarding_seen";

export function useOnboarding() {
  const [seen, setSeen] = useState<boolean>(localStorage.getItem(ONBOARDING_KEY) === "true");

  const markSeen = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setSeen(true);
  };

  return { seen, markSeen };
}
