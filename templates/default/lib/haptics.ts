import * as Haptics from "expo-haptics";

import { preferences } from "@/lib/preferences";

export { Haptics };

const gate = (fn: () => Promise<void>) => () => {
  if (!preferences.hapticsEnabled()) return Promise.resolve();
  return fn();
};

export const haptics = {
  selection: gate(() => Haptics.selectionAsync()),

  light: gate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: gate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: gate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  rigid: gate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  soft: gate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),

  success: gate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: gate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: gate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
