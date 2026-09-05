import { Image as ExpoImage } from "expo-image";
import { RNHostView } from "@expo/ui/swift-ui";

import { useThemedAsset } from "@/hooks/use-theme";
import { assets } from "@/lib/assets";

/**
 * The app mark, light or dark to match the theme. It is decorative next to the
 * heading it sits above, so it stays out of VoiceOver with an empty label.
 */
export default function BrandIcon({ size = 56 }: { size?: number }) {
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);
  return (
    <RNHostView matchContents>
      <ExpoImage
        source={brandIcon}
        style={{ width: size, height: size }}
        contentFit="contain"
        accessibilityLabel=""
      />
    </RNHostView>
  );
}
