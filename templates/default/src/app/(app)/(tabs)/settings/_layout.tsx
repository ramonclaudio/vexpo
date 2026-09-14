import { Stack } from "expo-router";

import { Colors } from "@/constants/theme";
import { useMotionScreenOptions } from "@/hooks/use-motion-screen-options";
import { FontFamily } from "@/constants/layout";
import { LoadingScreen } from "@/components/ui/loading-screen";

export const unstable_settings = {
  initialRouteName: "index",
};

export function SuspenseFallback() {
  return <LoadingScreen />;
}

export default function SettingsLayout() {
  const motion = useMotionScreenOptions();

  return (
    <Stack
      screenOptions={{
        ...motion,
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="preferences" options={{ headerShown: true }}>
        <Stack.Header transparent />
        <Stack.Screen.Title style={{ color: Colors.foreground, fontFamily: FontFamily.semiBold }}>
          Preferences
        </Stack.Screen.Title>
        <Stack.Screen.BackButton>Settings</Stack.Screen.BackButton>
      </Stack.Screen>
    </Stack>
  );
}
