import { Stack } from "expo-router";

import { Colors } from "@/constants/theme";
import { useMotionScreenOptions } from "@/hooks/use-motion-screen-options";
import { FontFamily } from "@/constants/layout";

export const unstable_settings = {
  home: { anchor: "index" },
  search: { anchor: "index" },
};

export default function SharedLayout({ segment }: { segment: string }) {
  const motion = useMotionScreenOptions();
  const isSearch = segment === "(search)";

  return (
    <Stack
      screenOptions={{
        ...motion,
        headerTintColor: Colors.foreground,
        headerBlurEffect: "none",
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerLargeStyle: { backgroundColor: "transparent" },
        headerTitleStyle: { fontFamily: FontFamily.semiBold },
        headerLargeTitleStyle: { fontFamily: FontFamily.bold },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: isSearch ? "Search" : "Home",
          headerShown: isSearch,
          headerLargeTitle: false,
          contentStyle: { backgroundColor: Colors.background },
        }}
      />
    </Stack>
  );
}
