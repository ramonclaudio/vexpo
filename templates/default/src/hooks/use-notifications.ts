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
      const { granted } = await requestPermission();
      if (!granted) return;

      const token = await getExpoPushToken();
      if (!token) return;

      setExpoPushToken(token);
      await upsertToken({ token, deviceType: "ios" });
    })();
  }, [isAuthenticated, upsertToken]);

  useEffect(() => {
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
        await upsertToken({ token: token.data, deviceType: "ios" });
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
      droppedSub.remove();
      tokenSub.remove();
    };
  }, [isAuthenticated, options, upsertToken]);

  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!lastResponse) return;
    handleNotificationResponse(lastResponse);
    clearLastNotificationResponse();
  }, [lastResponse]);

  return { expoPushToken };
}
