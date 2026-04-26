import React, { type ReactNode } from "react";
import { Box as InkBox, Text as InkText } from "ink";
import type { Spacing } from "../types.js";
import { z } from "zod";

export const BoxPropsSchema = z.object({
  children: z.any().optional(),
  flexDirection: z.enum(["row", "column", "row-reverse", "column-reverse"]).optional(),
  flexWrap: z.enum(["nowrap", "wrap", "wrap-reverse"]).optional(),
  flexShrink: z.union([z.number(), z.string()]).optional(),
  flexGrow: z.union([z.number(), z.string()]).optional(),
  alignItems: z.enum(["flex-start", "flex-end", "center", "baseline", "stretch"]).optional(),
  alignContent: z.enum(["flex-start", "flex-end", "center", "space-between", "space-around", "stretch"]).optional(),
  justifyContent: z.enum(["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"]).optional(),
  position: z.enum(["relative", "absolute"]).optional(),
  top: z.union([z.number(), z.string()]).optional(),
  right: z.union([z.number(), z.string()]).optional(),
  bottom: z.union([z.number(), z.string()]).optional(),
  left: z.union([z.number(), z.string()]).optional(),
  margin: z.union([z.number(), z.string(), z.any()]).optional(),
  marginTop: z.union([z.number(), z.string()]).optional(),
  marginBottom: z.union([z.number(), z.string()]).optional(),
  marginLeft: z.union([z.number(), z.string()]).optional(),
  marginRight: z.union([z.number(), z.string()]).optional(),
  padding: z.union([z.number(), z.string(), z.any()]).optional(),
  paddingTop: z.union([z.number(), z.string()]).optional(),
  paddingBottom: z.union([z.number(), z.string()]).optional(),
  paddingLeft: z.union([z.number(), z.string()]).optional(),
  paddingRight: z.union([z.number(), z.string()]).optional(),
  paddingX: z.union([z.number(), z.string()]).optional(),
  paddingY: z.union([z.number(), z.string()]).optional(),
  borderStyle: z.enum(["single", "double", "round", "bold", "none"]).optional(),
  borderColor: z.string().optional(),
  width: z.union([z.number(), z.string()]).optional(),
  height: z.union([z.number(), z.string()]).optional(),
  minWidth: z.union([z.number(), z.string()]).optional(),
  minHeight: z.union([z.number(), z.string()]).optional(),
  maxWidth: z.union([z.number(), z.string()]).optional(),
  maxHeight: z.union([z.number(), z.string()]).optional(),
  gap: z.union([z.number(), z.string()]).optional(),
  flex: z.union([z.number(), z.string()]).optional(),
  overflow: z.enum(["visible", "hidden", "scroll", "auto"]).optional(),
  overflowX: z.enum(["visible", "hidden", "scroll", "auto"]).optional(),
  overflowY: z.enum(["visible", "hidden", "scroll", "auto"]).optional(),
  style: z.any().optional(),
  backgroundColor: z.string().optional(),
  opacity: z.union([z.number(), z.string()]).optional(),
  onClick: z.any().optional(),
  onMouseEnter: z.any().optional(),
  onMouseLeave: z.any().optional(),
  onScroll: z.any().optional(),
  ref: z.any().optional(),
})
export type BoxProps = z.infer<typeof BoxPropsSchema>

export function Box({
  children,
  flexDirection,
  flexWrap,
  flexShrink,
  flexGrow,
  alignItems,
  justifyContent,
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
  style,
  backgroundColor,
  opacity,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onScroll,
  ...props
}: BoxProps): ReactNode {
  const inkProps: Record<string, unknown> = {
    flexDirection,
    flexWrap,
    flexShrink: flexShrink !== undefined ? Number(flexShrink) : undefined,
    flexGrow: flexGrow !== undefined ? Number(flexGrow) : undefined,
    alignItems,
    justifyContent,
    gap: gap !== undefined ? Number(gap) : undefined,
    flex: flex !== undefined ? Number(flex) : undefined,
    width: width !== undefined ? (typeof width === "string" ? width : Number(width)) : undefined,
    height: height !== undefined ? (typeof height === "string" ? height : Number(height)) : undefined,
    overflowX: overflow || overflowX,
    overflowY: overflow || overflowY,
    ...props,
  };

  if (margin !== undefined) {
    if (typeof margin === "number") {
      inkProps.margin = margin;
    } else if (typeof margin === "object") {
      inkProps.marginTop = margin.top !== undefined ? Number(margin.top) : undefined;
      inkProps.marginRight = margin.right !== undefined ? Number(margin.right) : undefined;
      inkProps.marginBottom = margin.bottom !== undefined ? Number(margin.bottom) : undefined;
      inkProps.marginLeft = margin.left !== undefined ? Number(margin.left) : undefined;
    }
  }
  if (marginTop !== undefined) inkProps.marginTop = Number(marginTop);
  if (marginBottom !== undefined) inkProps.marginBottom = Number(marginBottom);
  if (marginLeft !== undefined) inkProps.marginLeft = Number(marginLeft);
  if (marginRight !== undefined) inkProps.marginRight = Number(marginRight);

  if (padding !== undefined) {
    if (typeof padding === "number") {
      inkProps.padding = padding;
    } else if (typeof padding === "object") {
      inkProps.paddingTop = padding.top !== undefined ? Number(padding.top) : undefined;
      inkProps.paddingRight = padding.right !== undefined ? Number(padding.right) : undefined;
      inkProps.paddingBottom = padding.bottom !== undefined ? Number(padding.bottom) : undefined;
      inkProps.paddingLeft = padding.left !== undefined ? Number(padding.left) : undefined;
    }
  }
  if (paddingTop !== undefined) inkProps.paddingTop = Number(paddingTop);
  if (paddingBottom !== undefined) inkProps.paddingBottom = Number(paddingBottom);
  if (paddingLeft !== undefined) inkProps.paddingLeft = Number(paddingLeft);
  if (paddingRight !== undefined) inkProps.paddingRight = Number(paddingRight);
  if (paddingX !== undefined) {
    inkProps.paddingLeft = Number(paddingX);
    inkProps.paddingRight = Number(paddingX);
  }
  if (paddingY !== undefined) {
    inkProps.paddingTop = Number(paddingY);
    inkProps.paddingBottom = Number(paddingY);
  }

  return React.createElement(InkBox, inkProps, children);
}

export default Box;
