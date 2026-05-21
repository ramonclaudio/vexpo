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
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useNotifications } from "@/hooks/use-notifications";
import { useNavigationTracking } from "@/hooks/use-navigation-tracking";
import { useDeepLinkHandler } from "@/hooks/use-deep-link";
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
  // Routing reads Better Auth directly. Convex queries authenticate through
  // `BetterAuthConvexProvider` (see `lib/convex-auth.tsx` for the why).
  const { data: session, isPending } = authClient.useSession();
  const isAuthenticated = !!session?.session;
  const isLoading = isPending;
  const colorScheme = useColorScheme();
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const [assets] = useAssets(assetModules);

  useNotifications();
  useNavigationTracking();
  useDeepLinkHandler();

  useEffect(() => {
    if (!isLoading && assets) {
      SplashScreen.hideAsync();
    }
  }, [isLoading, assets]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background as string }}>
      <KeyboardProvider>
        <NavigationThemeProvider value={colorScheme === "dark" ? NavigationDark : NavigationLight}>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: reduceMotion ? "fade" : "default",
              animationDuration: reduceMotion ? 150 : undefined,
              contentStyle: { backgroundColor: colors.background as string },
            }}
          >
            <Stack.Protected guard={!isAuthenticated}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            <Stack.Protected guard={isAuthenticated}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
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
