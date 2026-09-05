import { Stack, router } from "expo-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";

import { api } from "@/convex/_generated/api";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { useDeepLinkHandler } from "@/hooks/use-deep-link";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useColors } from "@/hooks/use-theme";
import { useMotionScreenOptions } from "@/hooks/use-motion-screen-options";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { FontFamily } from "@/constants/layout";
import { LoadingScreen } from "@/components/ui/loading-screen";

export { AppErrorBoundary as ErrorBoundary } from "@/components/ui/error-boundary";

export function SuspenseFallback() {
  return <LoadingScreen testID="app-content-loading" />;
}

// Anchor the back-stack root so a guard flip lands on the tabs root, not
// whichever screen declares first.
export const unstable_settings = { anchor: "(tabs)" } as const;

export default function AppLayout() {
  // A guest counts as authenticated: they hold a real JWT and the tabs, the
  // onboarding and the Convex queries all work for them. `hasAccount` is the
  // narrower gate for the screens that need an actual account behind them.
  const { isAuthenticated, isGuest, hasAccount } = useAuthStatus();

  // Skipped while unauthed because Convex queries need a live JWT.
  const me = useQuery(api.users.getMe, isAuthenticated ? {} : "skip");
  const isAccountDeleted = !!me?.deletedAt;

  // First-launch gate. `seen` reads expo-sqlite/localStorage (app data, not
  // secrets) synchronously and stays reactive, so it never flashes async and
  // markSeen() in welcome flips this copy too. Wait for `me` to resolve
  // (undefined while loading) before routing so a fresh authed user lands
  // on welcome only once the account state is known. Welcome is registered
  // inside the authed guard below, so this only fires for signed-in users.
  const { seen } = useOnboarding();
  useEffect(() => {
    if (isAuthenticated && me !== undefined && !isAccountDeleted && !seen) {
      router.replace("/welcome");
    }
  }, [isAuthenticated, me, isAccountDeleted, seen]);

  useDeepLinkHandler();

  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const motion = useMotionScreenOptions("default");
  const headerTint = colors.foreground as string;
  const titleStyle = { color: headerTint, fontFamily: FontFamily.semiBold };

  return (
    <Stack
      screenOptions={{
        ...motion,
        headerShown: false,
        contentStyle: { backgroundColor: colors.background as string },
        headerBackTitle: "Back",
        headerTintColor: headerTint,
        headerShadowVisible: false,
      }}
    >
      <Stack.Protected guard={isAuthenticated && !isAccountDeleted}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        <Stack.Screen
          name="welcome"
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
            gestureEnabled: false,
            // A cross-fade is already the Reduce Motion answer: opacity only, no
            // travel. Cutting it to "none" there is stricter than the setting asks
            // for, and it's the one transition into onboarding.
            animation: "fade",
          }}
        />

        <Stack.Screen name="debug">
          <Stack.Header transparent />
          <Stack.Screen.Title style={titleStyle}>Debug</Stack.Screen.Title>
          <Stack.Screen.BackButton withMenu>Settings</Stack.Screen.BackButton>
        </Stack.Screen>

        <Stack.Screen name="help">
          <Stack.Header transparent />
          <Stack.Screen.Title style={titleStyle}>Help</Stack.Screen.Title>
          <Stack.Screen.BackButton>Settings</Stack.Screen.BackButton>
        </Stack.Screen>

        <Stack.Screen name="privacy">
          <Stack.Header transparent />
          <Stack.Screen.Title style={titleStyle}>Privacy</Stack.Screen.Title>
          <Stack.Screen.BackButton displayMode="minimal" withMenu>
            Settings
          </Stack.Screen.BackButton>
        </Stack.Screen>

        <Stack.Screen
          name="linked"
          options={{
            headerShown: true,
            title: "Linked",
            headerTitleStyle: titleStyle,
            presentation: "formSheet",
            sheetAllowedDetents: [0.5, 1],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            sheetLargestUndimmedDetentIndex: 0,
          }}
        />

        {/* A guest edits their name, photo and bio like anyone else, and those
            are exactly what `mergeGuestData` carries onto the account, so this
            stays on the plain authed guard. The screen hides the username and
            email fields for them. */}
        <Stack.Screen name="profile/index" options={{ headerShown: true }}>
          <Stack.Header transparent />
          <Stack.Screen.Title style={titleStyle}>Profile</Stack.Screen.Title>
          <Stack.Screen.BackButton>Settings</Stack.Screen.BackButton>
        </Stack.Screen>

        {/* Sessions lists the devices signed in to an account and password
            change needs a password, and a guest has neither. Nested inside the
            authed guard, not a replacement for it. */}
        <Stack.Protected guard={hasAccount}>
          <Stack.Screen
            name="profile/change-password"
            options={{ headerShown: true, presentation: "modal" }}
          >
            <Stack.Header transparent />
            <Stack.Screen.Title style={titleStyle}>Password</Stack.Screen.Title>
            <Stack.Screen.BackButton>Profile</Stack.Screen.BackButton>
          </Stack.Screen>

          <Stack.Screen name="sessions" options={{ headerShown: true }}>
            <Stack.Header transparent />
            <Stack.Screen.Title style={titleStyle}>Sessions</Stack.Screen.Title>
            <Stack.Screen.BackButton>Settings</Stack.Screen.BackButton>
          </Stack.Screen>
        </Stack.Protected>
      </Stack.Protected>

      {/* Own Stack.Protected so the whole authed tree above un-mounts when
          `deletedAt` is set and re-mounts on restore. */}
      <Stack.Protected guard={isAuthenticated && isAccountDeleted}>
        <Stack.Screen
          name="restore-account"
          options={{
            headerShown: false,
            presentation: "modal",
            gestureEnabled: false,
            animation: reduceMotion ? "fade" : "default",
          }}
        />
      </Stack.Protected>

      {/* Registered for guests too, so "Create an account" in settings has
          somewhere to go. With no session at all it is the only registered
          screen and renders as the wall; with a guest session `(tabs)` is the
          anchor and this is a screen you push onto it, and can back out of. */}
      <Stack.Protected guard={!hasAccount}>
        <Stack.Screen
          name="auth"
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
            gestureEnabled: isGuest,
            animation: reduceMotion ? "fade" : "fade_from_bottom",
            animationDuration: reduceMotion ? 150 : 250,
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}
