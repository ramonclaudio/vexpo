import { useEffect } from "react";

import StatusWidget from "@/widgets/status-widget";
import { useAuthStatus } from "@/hooks/use-auth-status";

export function useWidgetSync(): void {
  const { isPending, isGuest, hasAccount, name } = useAuthStatus();

  useEffect(() => {
    if (isPending) return;
    if (hasAccount) {
      StatusWidget.updateSnapshot({ headline: name ?? "Signed in", detail: "Tap to open" });
    } else if (isGuest) {
      StatusWidget.updateSnapshot({ headline: "Browsing as guest", detail: "Tap to sign up" });
    } else {
      StatusWidget.updateSnapshot({ headline: "Signed out", detail: "Tap to sign in" });
    }
  }, [isPending, isGuest, hasAccount, name]);
}
