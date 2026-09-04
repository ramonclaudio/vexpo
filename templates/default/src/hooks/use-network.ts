import { useEffect, useState } from "react";
import { useNetworkState } from "expo-network";

const OFFLINE_SETTLE_MS = 3000;

export function useNetwork() {
  const { isConnected, isInternetReachable } = useNetworkState();
  const probablyOffline = isConnected === false || isInternetReachable === false;
  const [settledOffline, setSettledOffline] = useState(false);

  useEffect(() => {
    if (!probablyOffline) return;
    const id = setTimeout(() => setSettledOffline(true), OFFLINE_SETTLE_MS);
    return () => {
      clearTimeout(id);
      setSettledOffline(false);
    };
  }, [probablyOffline]);

  return {
    isConnected,
    isInternetReachable,
    isOffline: settledOffline,
  };
}
