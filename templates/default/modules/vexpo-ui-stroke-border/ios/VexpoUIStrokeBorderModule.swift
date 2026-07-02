import ExpoModulesCore
import ExpoUI
import SwiftUI

// Vendored from expo/expo#47426 (merged 2026-07-02), which is in no published
// @expo/ui release yet. The stroke-style records, shape plumbing, and modifier
// struct below are the merged upstream implementation verbatim (the shape
// types live in @expo/ui's internal ShapeTypes.swift, so this module carries
// its own copies); only the registration entry point differs, going through
// the public `ViewModifierRegistry.register` API instead of the built-in
// table. Delete this module (and `src/lib/ui-stroke-border.ts`) once a
// released @expo/ui ships the modifier, then import it from
// `@expo/ui/swift-ui/modifiers`.

internal enum ShapeType: String, Enumerable {
  case capsule
  case circle
  case containerRelativeShape
  case ellipse
  case rectangle
  case roundedRectangle
}

internal enum RoundedCornerStyle: String, Enumerable {
  case continuous
  case circular
}

internal struct CornerSize: Record {
  @Field var width: Int = 0
  @Field var height: Int = 0
}

internal enum StrokeLineCap: String, Enumerable {
  case butt
  case round
  case square

  func toCGLineCap() -> CGLineCap {
    switch self {
    case .butt: return .butt
    case .round: return .round
    case .square: return .square
    }
  }
}

internal enum StrokeLineJoin: String, Enumerable {
  case miter
  case round
  case bevel

  func toCGLineJoin() -> CGLineJoin {
    switch self {
    case .miter: return .miter
    case .round: return .round
    case .bevel: return .bevel
    }
  }
}

internal struct StrokeStyleConfig: Record {
  @Field var lineWidth: CGFloat = 1
  @Field var lineCap: StrokeLineCap = .butt
  @Field var lineJoin: StrokeLineJoin = .miter
  @Field var miterLimit: CGFloat = 10
  @Field var dash: [CGFloat] = []
  @Field var dashPhase: CGFloat = 0

  func toStrokeStyle() -> StrokeStyle {
    return StrokeStyle(
      lineWidth: lineWidth,
      lineCap: lineCap.toCGLineCap(),
      lineJoin: lineJoin.toCGLineJoin(),
      miterLimit: miterLimit,
      dash: dash,
      dashPhase: dashPhase
    )
  }
}

internal func makeCapsule(style: RoundedCornerStyle?) -> Capsule {
  if let style = style {
    switch style {
    case .continuous:
      return Capsule(style: .continuous)
    case .circular:
      return Capsule(style: .circular)
    }
  }
  return Capsule()
}

internal func makeRoundedRectangle(
  cornerRadius: CGFloat,
  cornerSize: CornerSize?,
  style: RoundedCornerStyle?
) -> RoundedRectangle {
  if let style = style {
    switch style {
    case .continuous:
      if let cornerSize {
        return RoundedRectangle(cornerSize: CGSize(width: cornerSize.width, height: cornerSize.height), style: .continuous)
      }
      return RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    case .circular:
      if let cornerSize {
        return RoundedRectangle(cornerSize: CGSize(width: cornerSize.width, height: cornerSize.height), style: .circular)
      }
      return RoundedRectangle(cornerRadius: cornerRadius, style: .circular)
    }
  } else {
    if let cornerSize {
      return RoundedRectangle(cornerSize: CGSize(width: cornerSize.width, height: cornerSize.height))
    }
    return RoundedRectangle(cornerRadius: cornerRadius)
  }
}

internal struct StrokeBorderModifier: ViewModifier, Record {
  @Field var color: Color?
  @Field var style: StrokeStyleConfig?
  @Field var antialiased: Bool = true
  @Field var shape: ShapeType = .rectangle
  @Field var cornerRadius: CGFloat = 8
  @Field var roundedCornerStyle: RoundedCornerStyle?
  @Field var cornerSize: CornerSize?

  func body(content: Content) -> some View {
    content.overlay(strokeBorderView())
  }

  @ViewBuilder
  private func strokeBorderView() -> some View {
    let strokeStyle = (style ?? StrokeStyleConfig()).toStrokeStyle()
    switch shape {
    case .capsule:
      applyStrokeBorder(makeCapsule(style: roundedCornerStyle), strokeStyle)
    case .circle:
      applyStrokeBorder(Circle(), strokeStyle)
    case .containerRelativeShape:
      applyStrokeBorder(ContainerRelativeShape(), strokeStyle)
    case .ellipse:
      applyStrokeBorder(Ellipse(), strokeStyle)
    case .rectangle:
      applyStrokeBorder(Rectangle(), strokeStyle)
    case .roundedRectangle:
      applyStrokeBorder(makeRoundedRectangle(cornerRadius: cornerRadius, cornerSize: cornerSize, style: roundedCornerStyle), strokeStyle)
    }
  }

  @ViewBuilder
  private func applyStrokeBorder<S: InsettableShape>(_ shape: S, _ strokeStyle: StrokeStyle) -> some View {
    if let color {
      shape.strokeBorder(color, style: strokeStyle, antialiased: antialiased)
    } else {
      shape.strokeBorder(style: strokeStyle, antialiased: antialiased)
    }
  }
}

public final class VexpoUIStrokeBorderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VexpoUIStrokeBorder")

    OnCreate {
      ViewModifierRegistry.register("strokeBorder") { params, appContext, _ in
        try StrokeBorderModifier(from: params, appContext: appContext)
      }
    }

    OnDestroy {
      ViewModifierRegistry.unregister("strokeBorder")
    }
  }
}
