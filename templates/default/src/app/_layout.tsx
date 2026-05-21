import { ConvexReactClient } from "convex/react";
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
import { useColorScheme, useColors } from "@/hooks/use-theme";
import { useMotionScreenOptions } from "@/hooks/use-motion-screen-options";
import { useNotifications } from "@/hooks/use-notifications";
import { useNavigationTracking } from "@/hooks/use-navigation-tracking";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { UpdateBanner } from "@/components/ui/update-banner";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Duration } from "@/constants/ui";
import { NavigationDark, NavigationLight } from "@/constants/theme";
import { setForegroundHandler, registerBackgroundTask } from "@/lib/notifications";

const convex = new ConvexReactClient(env.convexUrl, {
  expectAuth: true,
  unsavedChangesWarning: false,
});

export { AppErrorBoundary as ErrorBoundary } from "@/components/ui/error-boundary";

if (__DEV__) registerDevMenuItems();

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: Duration.splash, fade: true });
setForegroundHandler();
registerBackgroundTask();

export default function RootLayout() {
  return (
    <BetterAuthConvexProvider client={convex}>
      <Suspense fallback={<LoadingScreen />}>
        <RootNavigator />
      </Suspense>
    </BetterAuthConvexProvider>
  );
}

function RootNavigator() {
  // Splash gates on both auth resolution and asset load. Auth gating itself
  // lives in `(app)/_layout.tsx` so `(app)` stays mounted under the auth modal.
  const { isPending } = authClient.useSession();
  const colorScheme = useColorScheme();
  const colors = useColors();
  const motion = useMotionScreenOptions("default");
  const [assets] = useAssets(assetModules);

  useNotifications();
  useNavigationTracking();

  useEffect(() => {
    if (!isPending && assets) SplashScreen.hideAsync();
  }, [isPending, assets]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background as string }}>
      <KeyboardProvider>
        <NavigationThemeProvider value={colorScheme === "dark" ? NavigationDark : NavigationLight}>
          <Stack
            screenOptions={{
              ...motion,
              headerShown: false,
              contentStyle: { backgroundColor: colors.background as string },
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
