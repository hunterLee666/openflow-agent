import React, { type ReactNode, type CSSProperties } from "react";
import { FOREGROUND_COLORS, BACKGROUND_COLORS, ANSI_CODES } from "../ansi.js";

export interface TextProps {
  children?: ReactNode;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dim?: boolean;
  dimColor?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  blink?: boolean;
  width?: number | string;
  style?: CSSProperties;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

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
