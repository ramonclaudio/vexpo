import { Stack } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { useAccountDeletionGuard } from "@/hooks/use-account-deletion-guard";
import { useDeepLinkHandler } from "@/hooks/use-deep-link";
import { useColors } from "@/hooks/use-theme";
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

  useAccountDeletionGuard();
  useDeepLinkHandler();

  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const headerTint = colors.foreground as string;
  const titleStyle = { color: headerTint, fontFamily: FontFamily.semiBold };

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background as string },
        headerBackTitle: "Back",
        headerTintColor: headerTint,
        headerShadowVisible: false,
        animation: reduceMotion ? "fade" : "slide_from_right",
        animationDuration: reduceMotion ? 150 : 300,
      }}
    >
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="welcome"
          options={{ headerShown: false, animation: reduceMotion ? "none" : "fade" }}
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

        <Stack.Screen name="linked" options={{ headerShown: true, title: "Linked" }} />

        <Stack.Screen name="profile/index" options={{ headerShown: true }}>
          <Stack.Header transparent />
          <Stack.Screen.Title style={titleStyle}>Profile</Stack.Screen.Title>
          <Stack.Screen.BackButton>Settings</Stack.Screen.BackButton>
        </Stack.Screen>

        <Stack.Screen name="profile/change-password" options={{ headerShown: true }}>
          <Stack.Header transparent />
          <Stack.Screen.Title style={titleStyle}>Password</Stack.Screen.Title>
          <Stack.Screen.BackButton>Profile</Stack.Screen.BackButton>
        </Stack.Screen>

        <Stack.Screen name="sessions" options={{ headerShown: true }}>
          <Stack.Header transparent />
          <Stack.Screen.Title style={titleStyle}>Sessions</Stack.Screen.Title>
          <Stack.Screen.BackButton>Settings</Stack.Screen.BackButton>
        </Stack.Screen>

        <Stack.Screen
          name="restore-account"
          options={{
            headerShown: false,
            animation: reduceMotion ? "fade" : "default",
            gestureEnabled: false,
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
