import { useCallback } from "react";
import { useWindowDimensions } from "react-native";

/**
 * Scales an SF Symbol `<Image systemName>` size with the system Dynamic Type
 * slider. SwiftUI `Label` carries this automatically when icons are paired
 * with text; standalone `Image systemName=` calls don't.
 *
 * Pass the base size you would write today and the hook returns the value
 * already multiplied by `fontScale`, so a chevron at 13pt grows in lockstep
 * with the row label that sits beside it.
 *
 *     const symbolSize = useSymbolSize();
 *     // <Image systemName="chevron.right" size={13} />
 *     <Image systemName="chevron.right" size={symbolSize(13)} />
 */
export function useSymbolSize(): (size: number) => number {
  const { fontScale } = useWindowDimensions();
  return useCallback((size: number) => Math.round(size * fontScale), [fontScale]);
}
