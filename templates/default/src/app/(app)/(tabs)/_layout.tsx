import { NativeTabs } from "expo-router/unstable-native-tabs";

import { FontFamily } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";
import { LoadingScreen } from "@/components/ui/loading-screen";

export function SuspenseFallback() {
  return <LoadingScreen testID="tabs-loading" />;
}

export default function TabLayout() {
  const colors = useColors();
  return (
    <NativeTabs
      backgroundColor={colors.background}
      blurEffect="systemDefault"
      tintColor={colors.tabIconSelected}
      iconColor={{
        default: colors.tabIconDefault,
        selected: colors.tabIconSelected,
      }}
      // No fontSize: UIKit sizes tab labels from the text style, and pinning a
      // point size opts them out of Larger Text.
      labelStyle={{ fontFamily: FontFamily.medium }}
      sidebarAdaptable
      minimizeBehavior="automatic"
      shadowColor={colors.separator}
      badgeBackgroundColor={colors.destructive}
      screenListeners={
        __DEV__
          ? {
              tabPress: (e) => {
                console.log("[Tab]", e.target);
              },
            }
          : undefined
      }
    >
      <NativeTabs.Trigger name="(home)" contentStyle={{ backgroundColor: colors.background }}>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings" contentStyle={{ backgroundColor: colors.background }}>
        <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="(search)"
        role="search"
        contentStyle={{ backgroundColor: colors.background }}
      >
        <NativeTabs.Trigger.Icon sf="magnifyingglass" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
