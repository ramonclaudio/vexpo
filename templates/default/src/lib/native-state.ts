import { useNativeState } from "@expo/ui/swift-ui";
import { runOnUI } from "react-native-worklets";

type ObservableState<T> = ReturnType<typeof useNativeState<T>>;

// Hops a write to `ObservableState.value` onto the UI worklet runtime so the
// update lands on the same thread that drives the SwiftUI host. Reads of
// `.value` are safe from any thread, but writing from the JS thread races the
// renderer and trips `ObservableState.value was set from the JS thread` in
// dev. `@expo/ui/swift-ui` already registers the SharedObject worklet
// serializer (`State/index.fx`) so `state` crosses thread boundaries safely.
export function setNativeValue<T>(state: ObservableState<T>, value: T): void {
  runOnUI(() => {
    "worklet";
    state.value = value;
  })();
}
