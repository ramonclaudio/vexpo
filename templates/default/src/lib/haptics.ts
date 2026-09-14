import * as Haptics from "expo-haptics";

import { hapticsStore } from "@/lib/preferences";

const gate = (fn: () => Promise<void>) => () => {
  if (!hapticsStore.get()) return Promise.resolve();
  return fn();
};

export const haptics = {
  selection: gate(() => Haptics.selectionAsync()),
  medium: gate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: gate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: gate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: gate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
