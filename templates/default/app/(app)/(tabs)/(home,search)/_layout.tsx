import { Stack, useSegments } from "expo-router";

import { useColors } from "@/hooks/use-theme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { HeaderTint } from "@/constants/theme";
import { FontFamily } from "@/constants/layout";

export const unstable_settings = {
  home: { anchor: "index" },
  search: { anchor: "index" },
};

export default function SharedLayout() {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const segments = useSegments() as string[];
  const isSearch = segments[2] === "(search)";

  return (
    <Stack
      screenOptions={{
        headerTintColor: HeaderTint as string,
        headerBlurEffect: "none",
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerLargeStyle: { backgroundColor: "transparent" },
        headerTitleStyle: { fontFamily: FontFamily.semiBold },
        headerLargeTitleStyle: { fontFamily: FontFamily.bold },
        animation: reduceMotion ? "fade" : "default",
        animationDuration: reduceMotion ? 150 : undefined,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: isSearch ? "Search" : "Home",
          headerShown: isSearch,
          headerLargeTitle: false,
          contentStyle: { backgroundColor: colors.background as string },
        }}
      />
    </Stack>
  );
}
