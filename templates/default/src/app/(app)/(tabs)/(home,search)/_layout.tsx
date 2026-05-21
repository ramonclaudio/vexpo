import { Stack } from "expo-router";

import { useColors } from "@/hooks/use-theme";
import { useMotionScreenOptions } from "@/hooks/use-motion-screen-options";
import { HeaderTint } from "@/constants/theme";
import { FontFamily } from "@/constants/layout";

export const unstable_settings = {
  home: { anchor: "index" },
  search: { anchor: "index" },
};

// `segment` is the active group name in the comma-shared array, e.g.
// `(home)` or `(search)`. Per the SDK 56 shared-routes docs, this is the
// canonical entry point — no `useSegments()` cast, no magic index.
export default function SharedLayout({ segment }: { segment: string }) {
  const colors = useColors();
  const motion = useMotionScreenOptions("default");
  const isSearch = segment === "(search)";

  return (
    <Stack
      screenOptions={{
        ...motion,
        headerTintColor: HeaderTint as string,
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
          contentStyle: { backgroundColor: colors.background as string },
        }}
      />
    </Stack>
  );
}
