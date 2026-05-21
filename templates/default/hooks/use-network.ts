import { useEffect, useState } from "react";
import { useNetworkState } from "expo-network";

// expo-network's iOS module uses a temporary `NWPathMonitor` for its initial
// probe (`getNetworkStateAsync`) with a 5s timeout. On simulator and during
// cold-start the temp monitor sometimes never fires, so the probe returns
// `isConnected: false` while the device is actually online. The persistent
// listener corrects it on the next change event, but until then the banner
// would flash "You're offline" on a working network. Gate the banner on a
// short settle window so transient probe failures don't surface.
const OFFLINE_SETTLE_MS = 3000;

export function useNetwork() {
  const { isConnected, isInternetReachable } = useNetworkState();
  // On iOS expo-network sets `isInternetReachable === isConnected`; we keep
  // both checks for cross-platform parity but they collapse to one signal.
  const probablyOffline = isConnected === false || isInternetReachable === false;
  const [settledOffline, setSettledOffline] = useState(false);

  useEffect(() => {
    if (!probablyOffline) {
      setSettledOffline(false);
      return;
    }
    const id = setTimeout(() => setSettledOffline(true), OFFLINE_SETTLE_MS);
    return () => clearTimeout(id);
  }, [probablyOffline]);

  return {
    isConnected,
    isInternetReachable,
    isOffline: settledOffline,
  };
}
