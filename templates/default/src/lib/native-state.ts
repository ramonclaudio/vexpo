import { useNativeState } from "@expo/ui/swift-ui";
import { scheduleOnUI } from "react-native-worklets";

type ObservableState<T> = ReturnType<typeof useNativeState<T>>;

export function setNativeValue<T>(state: ObservableState<T>, value: T): void {
  scheduleOnUI(() => {
    "worklet";
    state.value = value;
  });
}
