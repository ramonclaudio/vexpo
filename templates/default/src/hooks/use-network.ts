import { useEffect, useState } from "react";
import { useNetworkState } from "expo-network";

const OFFLINE_SETTLE_MS = 3000;

export function useNetwork() {
  const { isConnected, isInternetReachable } = useNetworkState();
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
