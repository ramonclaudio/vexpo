import { NativeTabs } from "expo-router/unstable-native-tabs";

import { FontFamily } from "@/constants/layout";
import { Colors } from "@/constants/theme";
import { LoadingScreen } from "@/components/ui/loading-screen";

export function SuspenseFallback() {
  return <LoadingScreen />;
}

export default function TabLayout() {
  return (
    <NativeTabs
      backgroundColor={Colors.background}
      blurEffect="systemDefault"
      tintColor={Colors.tabIconSelected}
      iconColor={{
        default: Colors.tabIconDefault,
        selected: Colors.tabIconSelected,
      }}
      // No fontSize here, it opts tab labels out of Larger Text.
      labelStyle={{ fontFamily: FontFamily.medium }}
      sidebarAdaptable
      minimizeBehavior="automatic"
      shadowColor={Colors.separator}
      badgeBackgroundColor={Colors.destructive}
    >
      <NativeTabs.Trigger name="(home)" contentStyle={{ backgroundColor: Colors.background }}>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings" contentStyle={{ backgroundColor: Colors.background }}>
        <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="(search)"
        role="search"
        contentStyle={{ backgroundColor: Colors.background }}
      >
        <NativeTabs.Trigger.Icon sf="magnifyingglass" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
