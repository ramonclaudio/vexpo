import { Stack } from "expo-router";

import { useColors } from "@/hooks/use-theme";
import { useMotionScreenOptions } from "@/hooks/use-motion-screen-options";
import { LoadingScreen } from "@/components/ui/loading-screen";

export { AppErrorBoundary as ErrorBoundary } from "@/components/ui/error-boundary";

export function SuspenseFallback() {
  return <LoadingScreen />;
}

export default function AuthLayout() {
  const colors = useColors();
  const motion = useMotionScreenOptions("fade_from_bottom", 250);
  return (
    <Stack
      screenOptions={{
        ...motion,
        headerShown: false,
        contentStyle: { backgroundColor: colors.background as string },
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
