import { Stack } from "expo-router";

import { useColors } from "@/hooks/use-theme";
import { useMotionScreenOptions } from "@/hooks/use-motion-screen-options";
import { FontFamily } from "@/constants/layout";
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
  const motion = useMotionScreenOptions("default");

  return (
    <Stack
      screenOptions={{
        ...motion,
        headerShown: false,
        contentStyle: { backgroundColor: colors.background as string },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="preferences" options={{ headerShown: true }}>
        <Stack.Header transparent />
        <Stack.Screen.Title
          style={{ color: HeaderTint as string, fontFamily: FontFamily.semiBold }}
        >
          Preferences
        </Stack.Screen.Title>
        <Stack.Screen.BackButton>Settings</Stack.Screen.BackButton>
      </Stack.Screen>
    </Stack>
  );
}
