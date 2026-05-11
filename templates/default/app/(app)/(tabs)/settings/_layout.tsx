import { Stack } from "expo-router";

import { useColors } from "@/hooks/use-theme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { HeaderTint } from "@/constants/theme";
import { LoadingScreen } from "@/components/ui/loading-screen";

export const unstable_settings = {
  initialRouteName: "index",
};

export function SuspenseFallback() {
  return <LoadingScreen />;
}

export default function SettingsLayout() {
  const colors = useColors();
  const reduceMotion = useReducedMotion();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background as string },
        animation: reduceMotion ? "fade" : "default",
        animationDuration: reduceMotion ? 150 : undefined,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="preferences" options={{ headerShown: true }}>
        <Stack.Header transparent />
        <Stack.Screen.Title style={{ color: HeaderTint as string }}>Preferences</Stack.Screen.Title>
        <Stack.Screen.BackButton>Settings</Stack.Screen.BackButton>
      </Stack.Screen>
    </Stack>
  );
}
