import React, { type ReactNode, type CSSProperties } from "react";
import { FOREGROUND_COLORS, BACKGROUND_COLORS, ANSI_CODES } from "../ansi.js";
import { z } from "zod";

export const TextPropsSchema = z.object({
  children: z.any().optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  bold: z.boolean().optional(),
  dim: z.boolean().optional(),
  dimColor: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  inverse: z.boolean().optional(),
  blink: z.boolean().optional(),
  width: z.union([z.number(), z.string()]).optional(),
  style: z.any().optional(),
  onClick: z.function().returns(z.void()).optional(),
  onMouseEnter: z.function().returns(z.void()).optional(),
  onMouseLeave: z.function().returns(z.void()).optional(),
})
export type TextProps = z.infer<typeof TextPropsSchema>

function buildAnsiStyle(props: TextProps): string {
  const codes: string[] = [];

  if (props.bold) codes.push(ANSI_CODES.BOLD);
  if (props.dim) codes.push(ANSI_CODES.DIM);
  if (props.italic) codes.push(ANSI_CODES.ITALIC);
  if (props.underline) codes.push(ANSI_CODES.UNDERLINE);
  if (props.strikethrough) codes.push(ANSI_CODES.STRIKETHROUGH);
  if (props.inverse) codes.push(ANSI_CODES.INVERSE);
  if (props.blink) codes.push(ANSI_CODES.BLINK);

  if (props.color) {
    const fg = FOREGROUND_COLORS[props.color];
    if (fg) codes.push(fg);
  }

  if (props.backgroundColor) {
    const bg = BACKGROUND_COLORS[props.backgroundColor];
    if (bg) codes.push(bg);
  }

  return codes.join("");
}

export function Text({
  children,
  bold,
  dim,
  dimColor,
  italic,
  underline,
  strikethrough,
  inverse,
  blink,
  color,
  backgroundColor,
  width,
  style,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: TextProps): ReactNode {
  const ansiPrefix = buildAnsiStyle({
    bold,
    dim: dim || dimColor,
    italic,
    underline,
    strikethrough,
    inverse,
    blink,
    color,
    backgroundColor,
  });

  const textStyle: CSSProperties = {
    ...style,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    cursor: onClick ? "pointer" : undefined,
  };

  if (width !== undefined) {
    textStyle.width = typeof width === "number" ? `${width}ch` : width;
  }

  if (!ansiPrefix && !children && !onClick) {
    return React.createElement("span", { style: textStyle });
  }

  const content = ansiPrefix
    ? `${ansiPrefix}${children}${ANSI_CODES.RESET}`
    : children;

  return React.createElement("span", {
    style: textStyle,
    onClick,
    onMouseEnter,
    onMouseLeave,
  }, content);
}

export default Text;
