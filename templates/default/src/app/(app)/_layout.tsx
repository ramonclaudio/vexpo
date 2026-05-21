import { Stack } from "expo-router";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { useDeepLinkHandler } from "@/hooks/use-deep-link";
import { useColors } from "@/hooks/use-theme";
import { useMotionScreenOptions } from "@/hooks/use-motion-screen-options";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { FontFamily } from "@/constants/layout";
import { LoadingScreen } from "@/components/ui/loading-screen";

export { AppErrorBoundary as ErrorBoundary } from "@/components/ui/error-boundary";

export function SuspenseFallback() {
  return <LoadingScreen />;
}

// Anchor the back-stack root so a guard flip lands users on the tabs root,
// not whichever screen happens to declare first.
export const unstable_settings = { anchor: "(tabs)" } as const;

export default function AppLayout() {
  // Better Auth is the canonical session signal. Convex follows via the bridge.
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.session;

  // Soft-delete state. Skipped while unauthed because Convex queries need a
  // live JWT; the auth modal renders behind a separate Stack.Protected and
  // doesn't care about deletion.
  const me = useQuery(api.users.getMe, isAuthenticated ? {} : "skip");
  const isAccountDeleted = !!me?.deletedAt;

  useDeepLinkHandler();

  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const motion = useMotionScreenOptions("slide_from_right", 300);
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

        {/*
          Onboarding blocks the rest of the tree. Full-screen modal so the
          tabs stay mounted underneath but are visually replaced until the
          user finishes the carousel.
        */}
        <Stack.Screen
          name="welcome"
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
            gestureEnabled: false,
            animation: reduceMotion ? "none" : "fade",
          }}
        />

        <Stack.Screen name="debug" options={{ presentation: "fullScreenModal" }}>
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

        {/*
          Diagnostic inspector — sheet detents fit the short list of params.
          Anchored to (tabs) so a deep link directly to the sheet leaves the
          tab stack mounted underneath.
        */}
        <Stack.Screen
          name="linked"
          options={{
            headerShown: true,
            title: "Linked",
            presentation: "formSheet",
            sheetAllowedDetents: [0.5, 1],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            sheetLargestUndimmedDetentIndex: 0,
          }}
        />

        <Stack.Screen name="profile/index" options={{ headerShown: true }}>
          <Stack.Header transparent />
          <Stack.Screen.Title style={titleStyle}>Profile</Stack.Screen.Title>
          <Stack.Screen.BackButton>Settings</Stack.Screen.BackButton>
        </Stack.Screen>

        {/*
          Password change is a transient task — full slide-up modal matches
          Apple Settings.app, gives the user clear "modal mode" semantics.
        */}
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

      {/*
        Soft-delete intercept. Lives in its own Stack.Protected so the entire
        authed tree above un-mounts when `deletedAt` is set, and re-mounts
        when the user restores. Replaces the imperative router.replace from
        the old useAccountDeletionGuard hook.
      */}
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

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen
          name="auth"
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
            gestureEnabled: false,
            animation: reduceMotion ? "fade" : "fade_from_bottom",
            animationDuration: reduceMotion ? 150 : 250,
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}
