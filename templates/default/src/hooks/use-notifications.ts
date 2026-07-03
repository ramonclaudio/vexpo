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

  // Read callbacks through a ref so inline `options` literals don't re-subscribe
  // the listeners (or re-run the cold-start handler) on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

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
    // double-navigating every runtime tap.) Mount-only so it can't re-fire
    // before the async clear settles and navigate twice.
    Notifications.getLastNotificationResponseAsync().then((initial) => {
      if (!initial) return;
      handleNotificationResponse(initial);
      optionsRef.current?.onNotificationResponse?.(initial);
      clearLastNotificationResponse();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      if (__DEV__) console.log("[Notification] Received:", notification.request.identifier);
      optionsRef.current?.onNotificationReceived?.(notification);
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (__DEV__) console.log("[Notification] Response:", response.actionIdentifier);
      handleNotificationResponse(response);
      optionsRef.current?.onNotificationResponse?.(response);
    });

    const droppedSub = Notifications.addNotificationsDroppedListener(() => {
      if (__DEV__) console.log("[Notification] Notifications dropped");
      optionsRef.current?.onNotificationsDropped?.();
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
  }, [isAuthenticated, upsertToken]);

  return { expoPushToken };
}
