import { useCallback } from "react";
import { useWindowDimensions } from "react-native";

// Ceiling on the Dynamic Type multiplier for SF Symbols. At the largest
// accessibility sizes `fontScale` passes 3x, which overruns icons pinned to a
// fixed frame (the 80x80 welcome glyph, the 44x44 eye toggle). `dynamicTypeSize`
// can't bound these: the size is computed here in JS, not through the SwiftUI
// Dynamic Type environment. So cap the multiplier, the icon analogue of the
// `dynamicTypeSize` clamp on fixed-geometry text (upstream expo/expo#46540).
const MAX_SYMBOL_SCALE = 1.6;

/**
 * Scales an SF Symbol `<Image systemName>` size with the system Dynamic Type
 * slider, bounded at `MAX_SYMBOL_SCALE` so icons in fixed frames don't overflow.
 * SwiftUI `Label` carries this automatically when icons are paired with text;
 * standalone `Image systemName=` calls don't, so multiply the base size here.
 */
export function useSymbolSize(): (size: number) => number {
  const { fontScale } = useWindowDimensions();
  return useCallback(
    (size: number) => Math.round(size * Math.min(fontScale, MAX_SYMBOL_SCALE)),
    [fontScale],
  );
}
