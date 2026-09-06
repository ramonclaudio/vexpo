import { Image as ExpoImage } from "expo-image";
import { RNHostView } from "@expo/ui/swift-ui";

import { useThemedAsset } from "@/hooks/use-theme";
import { assets } from "@/lib/assets";

// expo-image ignores accessibilityLabel unless `accessible` is also set.
export default function BrandIcon({ size = 56 }: { size?: number }) {
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);
  return (
    <RNHostView matchContents>
      <ExpoImage source={brandIcon} style={{ width: size, height: size }} contentFit="contain" />
    </RNHostView>
  );
}
