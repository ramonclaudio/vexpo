import { Image as ExpoImage, useImage } from "expo-image";
import { Image, RNHostView } from "@expo/ui/swift-ui";
import { accessibilityHidden, frame } from "@expo/ui/swift-ui/modifiers";

import { useColors } from "@/hooks/use-theme";

// Decorative both places it is used: the settings row and the picker button
// each carry their own label, and the fallback symbol below is hidden too.
export function RemoteAvatar({ url, size }: { url: string; size: number }) {
  const colors = useColors();
  const image = useImage(url, { maxWidth: size * 4 });
  if (!image) {
    return (
      <Image
        systemName="person.crop.circle.fill"
        size={size}
        color={colors.mutedForeground}
        modifiers={[frame({ width: size, height: size }), accessibilityHidden(true)]}
      />
    );
  }
  return (
    <RNHostView matchContents>
      <ExpoImage
        source={image}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    </RNHostView>
  );
}
