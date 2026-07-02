import ExpoModulesCore
import ExpoUI
import SwiftUI

// Vendored from expo/expo#47387 (merged 2026-07-01), which is in no published
// @expo/ui release yet. The enum, combiner, and modifier structs below are the
// merged upstream implementation verbatim; only the registration entry point
// differs, going through the public `ViewModifierRegistry.register` API instead
// of the built-in table. Delete this module (and `src/lib/ui-traits.ts`) once a
// released @expo/ui ships the modifiers, then import them from
// `@expo/ui/swift-ui/modifiers`.

internal enum AccessibilityTraitType: String, Enumerable {
  case isButton
  case isHeader
  case isImage
  case isSelected
  case isLink
  case isModal
  case isSummaryElement
  case updatesFrequently
  case startsMediaSession
  case allowsDirectInteraction
  case causesPageTurn
  case isToggle
  case playsSound
  case isStaticText
  case isSearchField
  case isKeyboardKey
  case isTabBar

  func toNative() -> AccessibilityTraits? {
    switch self {
    case .isButton:
      return .isButton
    case .isHeader:
      return .isHeader
    case .isImage:
      return .isImage
    case .isSelected:
      return .isSelected
    case .isLink:
      return .isLink
    case .isModal:
      return .isModal
    case .isSummaryElement:
      return .isSummaryElement
    case .updatesFrequently:
      return .updatesFrequently
    case .startsMediaSession:
      return .startsMediaSession
    case .allowsDirectInteraction:
      return .allowsDirectInteraction
    case .causesPageTurn:
      return .causesPageTurn
    case .isToggle:
      if #available(iOS 17.0, tvOS 17.0, macOS 14.0, *) {
        return .isToggle
      }
      return nil
    case .playsSound:
      return .playsSound
    case .isStaticText:
      return .isStaticText
    case .isSearchField:
      return .isSearchField
    case .isKeyboardKey:
      return .isKeyboardKey
    case .isTabBar:
      if #available(iOS 17.0, tvOS 17.0, macOS 14.0, *) {
        return .isTabBar
      }
      return nil
    }
  }
}

internal func combineAccessibilityTraits(_ traits: [AccessibilityTraitType]) -> AccessibilityTraits {
  var combined: AccessibilityTraits = []
  for trait in traits {
    if let native = trait.toNative() {
      combined.formUnion(native)
    }
  }
  return combined
}

internal struct AccessibilityAddTraitsModifier: ViewModifier, Record {
  @Field var traits: [AccessibilityTraitType] = []

  func body(content: Content) -> some View {
    content.accessibilityAddTraits(combineAccessibilityTraits(traits))
  }
}

internal struct AccessibilityRemoveTraitsModifier: ViewModifier, Record {
  @Field var traits: [AccessibilityTraitType] = []

  func body(content: Content) -> some View {
    content.accessibilityRemoveTraits(combineAccessibilityTraits(traits))
  }
}

public final class VexpoUITraitsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VexpoUITraits")

    OnCreate {
      ViewModifierRegistry.register("accessibilityAddTraits") { params, appContext, _ in
        try AccessibilityAddTraitsModifier(from: params, appContext: appContext)
      }
      ViewModifierRegistry.register("accessibilityRemoveTraits") { params, appContext, _ in
        try AccessibilityRemoveTraitsModifier(from: params, appContext: appContext)
      }
    }

    OnDestroy {
      ViewModifierRegistry.unregister("accessibilityAddTraits")
      ViewModifierRegistry.unregister("accessibilityRemoveTraits")
    }
  }
}
