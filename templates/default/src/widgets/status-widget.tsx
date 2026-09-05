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
      <Text modifiers={[font({ textStyle: "footnote" }), foregroundStyle("#8E8E93")]}>
        {props.detail}
      </Text>
    </VStack>
  );
};

export default createWidget("StatusWidget", StatusWidget);
