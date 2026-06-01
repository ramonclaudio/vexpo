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

// Anchor the back-stack root so a guard flip lands on the tabs root, not
// whichever screen declares first.
export const unstable_settings = { anchor: "(tabs)" } as const;

export default function AppLayout() {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.session;

  // Skipped while unauthed because Convex queries need a live JWT.
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

        <Stack.Screen
          name="welcome"
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
            gestureEnabled: false,
            animation: reduceMotion ? "none" : "fade",
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
