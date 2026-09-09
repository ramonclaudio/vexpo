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
      {/* Don't use a point size here, it opts the widget out of Larger Text. */}
      <Text modifiers={[font({ textStyle: "body", weight: "bold" })]}>{props.headline}</Text>
      {/* A hex here would sit outside the palette and its contrast test. */}
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
