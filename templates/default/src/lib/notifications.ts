import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";

export const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND_NOTIFICATION";

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
  if (!Device.isDevice) return;
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
  try {
    Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  } catch (e) {
    if (__DEV__) console.warn("[Notification] registerTaskAsync failed:", e);
  }
}

export async function getPermissionStatus() {
  const settings = await Notifications.getPermissionsAsync();
  return {
    granted: settings.granted,
    status: settings.status,
    canAskAgain: settings.canAskAgain,
    ios: settings.ios,
  };
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

export async function getDevicePushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    return data;
  } catch (e) {
    console.error("[Notification] Failed to get device push token:", e);
    return null;
  }
}

type ContentInput = Notifications.NotificationContentInput;
type TriggerInput = Notifications.NotificationTriggerInput;

export function scheduleNotification(content: ContentInput, trigger: TriggerInput) {
  return Notifications.scheduleNotificationAsync({ content, trigger });
}

export function scheduleTimeInterval(content: ContentInput, seconds: number, repeats = false) {
  return scheduleNotification(content, {
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    seconds,
    repeats,
  });
}

export function scheduleDate(content: ContentInput, date: Date | number) {
  return scheduleNotification(content, {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
  });
}

export function scheduleCalendar(
  content: ContentInput,
  dateComponents: Omit<Notifications.CalendarTriggerInput, "type" | "repeats">,
  repeats = false,
) {
  return scheduleNotification(content, {
    type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
    ...dateComponents,
    repeats,
  });
}

export function scheduleDaily(content: ContentInput, hour: number, minute: number) {
  return scheduleNotification(content, {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour,
    minute,
  });
}

export function scheduleWeekly(
  content: ContentInput,
  weekday: number,
  hour: number,
  minute: number,
) {
  return scheduleNotification(content, {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    weekday,
    hour,
    minute,
  });
}

export function scheduleMonthly(content: ContentInput, day: number, hour: number, minute: number) {
  return scheduleNotification(content, {
    type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
    day,
    hour,
    minute,
  });
}

export function scheduleYearly(
  content: ContentInput,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  return scheduleNotification(content, {
    type: Notifications.SchedulableTriggerInputTypes.YEARLY,
    month,
    day,
    hour,
    minute,
  });
}

export function getAllScheduled() {
  return Notifications.getAllScheduledNotificationsAsync();
}

export function cancelScheduled(id: string) {
  return Notifications.cancelScheduledNotificationAsync(id);
}

export function cancelAllScheduled() {
  return Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getNextTriggerDate(
  trigger: Notifications.SchedulableNotificationTriggerInput,
): Promise<Date | null> {
  const timestamp = await Notifications.getNextTriggerDateAsync(trigger);
  return timestamp ? new Date(timestamp) : null;
}

export function getBadgeCount() {
  return Notifications.getBadgeCountAsync();
}

export function setBadgeCount(count: number) {
  return Notifications.setBadgeCountAsync(count);
}

export function dismissNotification(id: string) {
  return Notifications.dismissNotificationAsync(id);
}

export function dismissAllNotifications() {
  return Notifications.dismissAllNotificationsAsync();
}

export function getPresentedNotifications() {
  return Notifications.getPresentedNotificationsAsync();
}

export function clearLastNotificationResponse() {
  Notifications.clearLastNotificationResponse();
}
