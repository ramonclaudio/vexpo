import { Image as ExpoImage } from "expo-image";
import { RNHostView } from "@expo/ui/swift-ui";

import { useColorScheme } from "@/hooks/use-theme";
import { assets } from "@/lib/assets";

export default function BrandIcon({ size = 56 }: { size?: number }) {
  const brandIcon = useColorScheme() === "dark" ? assets.brandIconDark : assets.brandIconLight;
  return (
    <RNHostView matchContents>
      <ExpoImage source={brandIcon} style={{ width: size, height: size }} contentFit="contain" />
    </RNHostView>
  );
}
