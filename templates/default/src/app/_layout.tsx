import { ConvexReactClient } from "convex/react";
import { ObserveRoot, useObserve } from "expo-observe";
import { Stack, ThemeProvider as NavigationThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Suspense, useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "react-native-reanimated";

import { registerDevMenuItems } from "@/lib/dev-menu";
import { authClient } from "@/lib/auth-client";
import { BetterAuthConvexProvider } from "@/lib/convex-auth";
import { assetModules } from "@/lib/assets";
import { useAssets } from "expo-asset";
import { env } from "@/lib/env";
import { useColorScheme } from "@/hooks/use-theme";
import { useMotionScreenOptions } from "@/hooks/use-motion-screen-options";
import { useWidgetSync } from "@/hooks/use-widget-sync";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { UpdateBanner } from "@/components/ui/update-banner";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Duration } from "@/constants/ui";
import { Colors, NavigationDark, NavigationLight } from "@/constants/theme";

const convex = new ConvexReactClient(env.convexUrl, {
  unsavedChangesWarning: false,
});

export { AppErrorBoundary as ErrorBoundary } from "@/components/ui/error-boundary";

if (__DEV__) registerDevMenuItems();

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: Duration.splash, fade: true });

function RootLayout() {
  return (
    <BetterAuthConvexProvider client={convex}>
      <Suspense fallback={<LoadingScreen />}>
        <RootNavigator />
      </Suspense>
    </BetterAuthConvexProvider>
  );
}

export default ObserveRoot.wrap(RootLayout);

function RootNavigator() {
  const { isPending } = authClient.useSession();
  const colorScheme = useColorScheme();
  const motion = useMotionScreenOptions();
  const [assets, assetError] = useAssets(assetModules);
  const { markInteractive } = useObserve();

  useWidgetSync();

  useEffect(() => {
    if (assetError && __DEV__) console.warn("[assets] failed to load:", assetError);
    if (!isPending && (assets || assetError)) {
      SplashScreen.hideAsync();
      markInteractive();
    }
  }, [isPending, assets, assetError, markInteractive]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
      <KeyboardProvider>
        <NavigationThemeProvider value={colorScheme === "dark" ? NavigationDark : NavigationLight}>
          <Stack
            screenOptions={{
              ...motion,
              headerShown: false,
              contentStyle: { backgroundColor: Colors.background },
            }}
          >
            <Stack.Screen name="(app)" />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="auto" />
          <OfflineBanner />
          <UpdateBanner />
        </NavigationThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
