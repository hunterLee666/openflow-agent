import React, { type ReactNode, type CSSProperties } from "react";
import type {
  Spacing,
} from "../types.js";
import { z } from "zod";

export const BoxPropsSchema = z.object({
  children: z.any().optional(),
  flexDirection: z.enum(["row", "column", "row-reverse", "column-reverse"]).optional(),
  flexWrap: z.enum(["nowrap", "wrap", "wrap-reverse"]).optional(),
  flexShrink: z.number().optional(),
  flexGrow: z.number().optional(),
  alignItems: z.enum(["flex-start", "flex-end", "center", "baseline", "stretch"]).optional(),
  alignContent: z.enum(["flex-start", "flex-end", "center", "space-between", "space-around", "stretch"]).optional(),
  justifyContent: z.enum(["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"]).optional(),
  position: z.enum(["relative", "absolute"]).optional(),
  top: z.number().optional(),
  right: z.number().optional(),
  bottom: z.number().optional(),
  left: z.number().optional(),
  margin: z.union([z.number(), z.any()]).optional(),
  marginTop: z.number().optional(),
  marginBottom: z.number().optional(),
  marginLeft: z.number().optional(),
  marginRight: z.number().optional(),
  padding: z.union([z.number(), z.any()]).optional(),
  paddingTop: z.number().optional(),
  paddingBottom: z.number().optional(),
  paddingLeft: z.number().optional(),
  paddingRight: z.number().optional(),
  paddingX: z.number().optional(),
  paddingY: z.number().optional(),
  borderStyle: z.enum(["single", "double", "round", "bold", "none"]).optional(),
  borderColor: z.string().optional(),
  width: z.union([z.number(), z.string()]).optional(),
  height: z.union([z.number(), z.string()]).optional(),
  minWidth: z.number().optional(),
  minHeight: z.number().optional(),
  maxWidth: z.number().optional(),
  maxHeight: z.number().optional(),
  gap: z.number().optional(),
  flex: z.union([z.number(), z.string()]).optional(),
  overflow: z.enum(["visible", "hidden", "scroll", "auto"]).optional(),
  overflowX: z.enum(["visible", "hidden", "scroll", "auto"]).optional(),
  overflowY: z.enum(["visible", "hidden", "scroll", "auto"]).optional(),
  style: z.any().optional(),
  backgroundColor: z.string().optional(),
  opacity: z.number().optional(),
  onClick: z.any().optional(),
  onMouseEnter: z.any().optional(),
  onMouseLeave: z.any().optional(),
  onScroll: z.any().optional(),
  ref: z.any().optional(),
})
export type BoxProps = z.infer<typeof BoxPropsSchema>

function getSpacingValue(spacing: number | Spacing | undefined, side: keyof Spacing): number {
  if (spacing === undefined) return 0;
  if (typeof spacing === "number") return spacing;
  return spacing[side] ?? 0;
}

const BORDER_COLORS: Record<string, string> = {
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  brightBlack: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
};

export function Box({
  children,
  flexDirection = "row",
  flexWrap,
  flexShrink,
  flexGrow,
  alignItems = "stretch",
  justifyContent = "flex-start",
  margin,
  marginTop,
  marginBottom,
  marginLeft,
  marginRight,
  padding,
  paddingTop,
  paddingBottom,
  paddingLeft,
  paddingRight,
  paddingX,
  paddingY,
  borderStyle,
  borderColor,
  width,
  height,
  gap,
  flex,
  overflow,
  overflowX,
  overflowY,
  backgroundColor,
  opacity,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onScroll,
  ...props
}: BoxProps): ReactNode {
  const style: CSSProperties = {
    display: "flex",
    flexDirection,
    flexWrap,
    alignItems,
    justifyContent,
    cursor: onClick ? "pointer" : undefined,
    ...props.style,
  };

  if (width !== undefined) {
    style.width = typeof width === "number" ? `${width}` : width;
  }
  if (height !== undefined) {
    style.height = typeof height === "number" ? `${height}` : height;
  }
  if (gap !== undefined) {
    style.gap = gap;
  }
  if (flex !== undefined) {
    style.flex = typeof flex === "number" ? `${flex} 0 0` : flex;
  }
  if (flexShrink !== undefined) {
    style.flexShrink = flexShrink;
  }
  if (flexGrow !== undefined) {
    style.flexGrow = flexGrow;
  }
  if (overflow !== undefined) {
    style.overflow = overflow;
  }
  if (overflowX !== undefined) {
    style.overflowX = overflowX;
  }
  if (overflowY !== undefined) {
    style.overflowY = overflowY;
  }
  if (margin !== undefined) {
    if (typeof margin === "number") {
      style.margin = margin;
    } else {
      if (margin.top !== undefined) style.marginTop = margin.top;
      if (margin.right !== undefined) style.marginRight = margin.right;
      if (margin.bottom !== undefined) style.marginBottom = margin.bottom;
      if (margin.left !== undefined) style.marginLeft = margin.left;
    }
  }
  if (marginTop !== undefined) style.marginTop = marginTop;
  if (marginBottom !== undefined) style.marginBottom = marginBottom;
  if (marginLeft !== undefined) style.marginLeft = marginLeft;
  if (marginRight !== undefined) style.marginRight = marginRight;
  if (padding !== undefined) {
    if (typeof padding === "number") {
      style.padding = padding;
    } else {
      if (padding.top !== undefined) style.paddingTop = padding.top;
      if (padding.right !== undefined) style.paddingRight = padding.right;
      if (padding.bottom !== undefined) style.paddingBottom = padding.bottom;
      if (padding.left !== undefined) style.paddingLeft = padding.left;
    }
  }
  if (paddingTop !== undefined) style.paddingTop = paddingTop;
  if (paddingBottom !== undefined) style.paddingBottom = paddingBottom;
  if (paddingLeft !== undefined) style.paddingLeft = paddingLeft;
  if (paddingRight !== undefined) style.paddingRight = paddingRight;
  if (paddingX !== undefined) {
    style.paddingLeft = paddingX;
    style.paddingRight = paddingX;
  }
  if (paddingY !== undefined) {
    style.paddingTop = paddingY;
    style.paddingBottom = paddingY;
  }
  if (backgroundColor) {
    style.backgroundColor = backgroundColor;
  }
  if (opacity !== undefined) {
    style.opacity = opacity;
  }

  return React.createElement("div", {
    style,
    onClick,
    onMouseEnter,
    onMouseLeave,
    onScroll,
  }, children);
}

export default Box;
