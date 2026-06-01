import { useNativeState } from "@expo/ui/swift-ui";
import { runOnUI } from "react-native-worklets";

type ObservableState<T> = ReturnType<typeof useNativeState<T>>;

// Hops a write to `ObservableState.value` onto the UI worklet runtime so the
// update lands synchronously on the thread that drives the SwiftUI host. Reads
// of `.value` are safe from any thread. A JS-thread write still applies, but
// it's scheduled to the UI thread asynchronously (not readable until it lands)
// and emits a one-time dev `console.warn` ("ObservableState.value was set from
// the JS thread..."). The worklet hop lands the write on the same frame and
// silences that warning. `@expo/ui/swift-ui` registers the SharedObject
// worklet serializer (`State/index.fx`) so `state` crosses thread boundaries
// safely.
export function setNativeValue<T>(state: ObservableState<T>, value: T): void {
  runOnUI(() => {
    "worklet";
    state.value = value;
  })();
}
