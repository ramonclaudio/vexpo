import { Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle } from "@expo/ui/swift-ui/modifiers";
import { createWidget } from "expo-widgets";

export type StatusWidgetProps = {
  headline: string;
  detail: string;
};

const StatusWidget = (props: StatusWidgetProps) => {
  "widget";
  return (
    <VStack spacing={4}>
      {/* Text styles, not point sizes: a fixed size ignores Larger Text, and
          body and footnote are the 17 and 13 these two used to hard-code. */}
      <Text modifiers={[font({ textStyle: "body", weight: "bold" })]}>{props.headline}</Text>
      {/* Hierarchical, not a hex: the grey this used to hard-code measured
          3.26:1 on a light widget, under the 4.5 Apple asks for at footnote
          size, and it was the one colour the palette and its contrast test
          never saw. SwiftUI resolves `secondary` per appearance. */}
      <Text
        modifiers={[
          font({ textStyle: "footnote" }),
          foregroundStyle({ type: "hierarchical", style: "secondary" }),
        ]}
      >
        {props.detail}
      </Text>
    </VStack>
  );
};

export default createWidget("StatusWidget", StatusWidget);
