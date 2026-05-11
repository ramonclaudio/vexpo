import { useNetworkState } from "expo-network";

export function useNetwork() {
  const { isConnected, isInternetReachable } = useNetworkState();

  return {
    isConnected,
    isInternetReachable,
    isOffline: isConnected === false || isInternetReachable === false,
  };
}
