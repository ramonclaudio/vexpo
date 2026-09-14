import { Image as ExpoImage, useImage } from "expo-image";
import { Image, RNHostView } from "@expo/ui/swift-ui";
import { accessibilityHidden, frame } from "@expo/ui/swift-ui/modifiers";

import { Colors } from "@/constants/theme";

function Placeholder({ size }: { size: number }) {
  return (
    <Image
      systemName="person.crop.circle.fill"
      size={size}
      color={Colors.mutedForeground}
      modifiers={[frame({ width: size, height: size }), accessibilityHidden(true)]}
    />
  );
}

export function Avatar({ url, size }: { url: string | null; size: number }) {
  return url ? <RemoteAvatar key={url} url={url} size={size} /> : <Placeholder size={size} />;
}

function RemoteAvatar({ url, size }: { url: string; size: number }) {
  const image = useImage(url, { maxWidth: size * 4 });
  if (!image) return <Placeholder size={size} />;
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
