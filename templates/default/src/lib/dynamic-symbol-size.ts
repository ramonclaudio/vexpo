import { useCallback } from "react";
import { useWindowDimensions } from "react-native";

/**
 * Scales an SF Symbol `<Image systemName>` size with the system Dynamic Type
 * slider. SwiftUI `Label` carries this automatically when icons are paired
 * with text; standalone `Image systemName=` calls don't, so multiply the base
 * size by `fontScale` here.
 */
export function useSymbolSize(): (size: number) => number {
  const { fontScale } = useWindowDimensions();
  return useCallback((size: number) => Math.round(size * fontScale), [fontScale]);
}
