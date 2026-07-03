import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND_NOTIFICATION";

try {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    BACKGROUND_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error) {
        console.error("[Notification] Background task error:", error);
        return;
      }
      if (__DEV__) console.log("[Notification] Background payload:", data);
    },
  );
} catch (e) {
  if (__DEV__) console.warn("[Notification] defineTask failed:", e);
}

interface ForegroundOptions {
  shouldShowBanner?: boolean;
  shouldShowList?: boolean;
  shouldPlaySound?: boolean;
  shouldSetBadge?: boolean;
}

export function setForegroundHandler(options?: ForegroundOptions) {
  // No Device guard: setNotificationHandler is pure JS (no APNs, no native
  // gate) and runs fine on the simulator.
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: options?.shouldShowBanner ?? true,
        shouldShowList: options?.shouldShowList ?? true,
        shouldPlaySound: options?.shouldPlaySound ?? true,
        shouldSetBadge: options?.shouldSetBadge ?? false,
      }),
    });
  } catch (e) {
    if (__DEV__) console.warn("[Notification] setForegroundHandler failed:", e);
  }
}

export function registerBackgroundTask() {
  if (!Device.isDevice) return;
  // registerTaskAsync is async: a try/catch around the un-awaited call can't
  // trap its rejection (e.g. UnavailabilityError), so attach .catch instead.
  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((e) => {
    if (__DEV__) console.warn("[Notification] registerTaskAsync failed:", e);
  });
}

export async function requestPermission() {
  const settings = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowCriticalAlerts: false,
      allowProvisional: false,
      provideAppNotificationSettings: true,
    },
  });
  return {
    granted: settings.granted,
    status: settings.status,
    canAskAgain: settings.canAskAgain,
    ios: settings.ios,
  };
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  if (!projectId) {
    console.warn("[Notification] EAS projectId not found");
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (e) {
    console.error("[Notification] Failed to get Expo push token:", e);
    return null;
  }
}

export function clearLastNotificationResponse() {
  Notifications.clearLastNotificationResponse();
}
