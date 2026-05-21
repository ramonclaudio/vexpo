import { Stack } from "expo-router";

import { useColors } from "@/hooks/use-theme";
import { useMotionScreenOptions } from "@/hooks/use-motion-screen-options";
import { FontFamily } from "@/constants/layout";

/**
 * Profile-area sub-stack. Centralizes the header config that previously
 * lived in two flat `Stack.Screen name="profile/index|change-password"`
 * declarations under `(app)/_layout.tsx`. New profile screens get headers
 * from the inherited `screenOptions` plus per-screen overrides.
 */
export default function ProfileLayout() {
  const colors = useColors();
  const motion = useMotionScreenOptions("slide_from_right", 300);
  const headerTint = colors.foreground as string;
  const titleStyle = { color: headerTint, fontFamily: FontFamily.semiBold };

  return (
    <Stack
      screenOptions={{
        ...motion,
        headerShown: true,
        contentStyle: { backgroundColor: colors.background as string },
        headerBackTitle: "Back",
        headerTintColor: headerTint,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index">
        <Stack.Header transparent />
        <Stack.Screen.Title style={titleStyle}>Profile</Stack.Screen.Title>
        <Stack.Screen.BackButton>Settings</Stack.Screen.BackButton>
      </Stack.Screen>

      {/*
        Password change is a transient task — full slide-up modal matches
        Apple Settings.app, gives the user clear "modal mode" semantics.
      */}
      <Stack.Screen name="change-password" options={{ presentation: "modal" }}>
        <Stack.Header transparent />
        <Stack.Screen.Title style={titleStyle}>Password</Stack.Screen.Title>
        <Stack.Screen.BackButton>Profile</Stack.Screen.BackButton>
      </Stack.Screen>
    </Stack>
  );
}
