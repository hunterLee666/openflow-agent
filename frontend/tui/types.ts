export interface TerminalSize {
  width: number;
  height: number;
  pixels?: {
    width: number;
    height: number;
  };
}

export interface Color {
  red: number;
  green: number;
  blue: number;
}

export interface Style {
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  invisible?: boolean;
  hidden?: boolean;
  blink?: boolean;
  foreground?: string | Color;
  background?: string | Color;
}

export interface Cursor {
  x: number;
  y: number;
}

export interface Node {
  type: string;
  props: Record<string, unknown>;
  children?: Node[];
  cursor?: Cursor;
  style?: Style;
}

export interface YogaConfig {
  experimentalTree?: boolean;
}

export interface LayoutResult {
  width: number;
  height: number;
  left: number;
  top: number;
}

export type FlexDirection = "row" | "column" | "row-reverse" | "column-reverse";
export type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";
export type AlignItems = "flex-start" | "flex-end" | "center" | "baseline" | "stretch";
export type AlignContent = "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "stretch";
export type JustifyContent = "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly";
export type Position = "relative" | "absolute";

export interface Spacing {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface BorderStyle {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
  color?: string;
}
