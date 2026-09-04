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
      <Text modifiers={[font({ weight: "bold", size: 17 })]}>{props.headline}</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle("#8E8E93")]}>{props.detail}</Text>
    </VStack>
  );
};

export default createWidget("StatusWidget", StatusWidget);
