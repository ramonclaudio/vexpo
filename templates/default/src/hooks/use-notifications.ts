import { useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import { useConvexAuth } from "convex/react";
import { useMutation } from "convex/react";
import { router, type Href } from "expo-router";

import { api } from "@/convex/_generated/api";
import { resolveDeepLink } from "@/lib/deep-link";
import {
  getExpoPushToken,
  requestPermission,
  clearLastNotificationResponse,
} from "@/lib/notifications";

interface UseNotificationsOptions {
  onNotificationReceived?: (notification: Notifications.Notification) => void;
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void;
  onNotificationsDropped?: () => void;
}

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const url = response.notification.request.content.data?.url;
  if (typeof url !== "string") return;

  const { href, params } = resolveDeepLink(url);
  if (!href) {
    if (__DEV__) console.warn("[Notification] Blocked navigation to:", url);
    return;
  }
  router.push({ pathname: href, params } as Href);
}

export function useNotifications(options?: UseNotificationsOptions) {
  const { isAuthenticated } = useConvexAuth();
  const upsertToken = useMutation(api.pushTokens.upsert);
  const registered = useRef(false);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      registered.current = false;
      setExpoPushToken(null);
      return;
    }
    if (registered.current) return;
    registered.current = true;

    (async () => {
      try {
        const { granted } = await requestPermission();
        if (!granted) return;

        const token = await getExpoPushToken();
        if (!token) return;

        setExpoPushToken(token);
        await upsertToken({ token, deviceType: "ios" });
      } catch (e) {
        // Reset so a transient failure (permission throw, network) retries on
        // the next render instead of silently dropping push registration for
        // the session. The early returns above intentionally keep it true.
        registered.current = false;
        if (__DEV__) console.warn("[Notification] registration failed:", e);
      }
    })();
  }, [isAuthenticated, upsertToken]);

  useEffect(() => {
    // Cold-start deep link: the launch tap arrives via the last-response
    // getter, not the runtime listener below, so handle it once here.
    // (useLastNotificationResponse would fire for BOTH cold-start and runtime,
    // double-navigating every runtime tap.)
    Notifications.getLastNotificationResponseAsync().then((initial) => {
      if (!initial) return;
      handleNotificationResponse(initial);
      options?.onNotificationResponse?.(initial);
      clearLastNotificationResponse();
    });

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      if (__DEV__) console.log("[Notification] Received:", notification.request.identifier);
      options?.onNotificationReceived?.(notification);
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (__DEV__) console.log("[Notification] Response:", response.actionIdentifier);
      handleNotificationResponse(response);
      options?.onNotificationResponse?.(response);
    });

    const droppedSub = Notifications.addNotificationsDroppedListener(() => {
      if (__DEV__) console.log("[Notification] Notifications dropped");
      options?.onNotificationsDropped?.();
    });

    const tokenSub = Notifications.addPushTokenListener(async (token) => {
      if (__DEV__) console.log("[Notification] Token rotated:", token.data);
      if (isAuthenticated && typeof token.data === "string") {
        try {
          await upsertToken({ token: token.data, deviceType: "ios" });
        } catch (e) {
          if (__DEV__) console.warn("[Notification] token upsert failed:", e);
        }
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
      droppedSub.remove();
      tokenSub.remove();
    };
  }, [isAuthenticated, options, upsertToken]);

  return { expoPushToken };
}
