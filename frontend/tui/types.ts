import { z } from "zod";

export const ColorSchema = z.object({
  red: z.number().min(0).max(255),
  green: z.number().min(0).max(255),
  blue: z.number().min(0).max(255),
});
export type Color = z.infer<typeof ColorSchema>;

export const PixelSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});
export type PixelSize = z.infer<typeof PixelSizeSchema>;

export const TerminalSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  pixels: PixelSizeSchema.optional(),
});
export type TerminalSize = z.infer<typeof TerminalSizeSchema>;

export const StyleSchema = z.object({
  bold: z.boolean().optional(),
  dim: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  inverse: z.boolean().optional(),
  invisible: z.boolean().optional(),
  hidden: z.boolean().optional(),
  blink: z.boolean().optional(),
  foreground: z.union([z.string(), ColorSchema]).optional(),
  background: z.union([z.string(), ColorSchema]).optional(),
});
export type Style = z.infer<typeof StyleSchema>;

export const CursorSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});
export type Cursor = z.infer<typeof CursorSchema>;

export const NodeSchema: z.ZodType<{
  type: string;
  props: Record<string, unknown>;
  children?: { type: string; props: Record<string, unknown>; children?: unknown[]; cursor?: Cursor; style?: Style }[];
  cursor?: Cursor;
  style?: Style;
}> = z.lazy(() =>
  z.object({
    type: z.string(),
    props: z.record(z.unknown()),
    children: NodeSchema.array().optional(),
    cursor: CursorSchema.optional(),
    style: StyleSchema.optional(),
  })
);
export type Node = z.infer<typeof NodeSchema>;

export const YogaConfigSchema = z.object({
  experimentalTree: z.boolean().optional(),
});
export type YogaConfig = z.infer<typeof YogaConfigSchema>;

export const LayoutResultSchema = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  left: z.number().nonnegative(),
  top: z.number().nonnegative(),
});
export type LayoutResult = z.infer<typeof LayoutResultSchema>;

export const FlexDirectionSchema = z.enum(["row", "column", "row-reverse", "column-reverse"]);
export type FlexDirection = z.infer<typeof FlexDirectionSchema>;

export const FlexWrapSchema = z.enum(["nowrap", "wrap", "wrap-reverse"]);
export type FlexWrap = z.infer<typeof FlexWrapSchema>;

export const AlignItemsSchema = z.enum(["flex-start", "flex-end", "center", "baseline", "stretch"]);
export type AlignItems = z.infer<typeof AlignItemsSchema>;

export const AlignContentSchema = z.enum(["flex-start", "flex-end", "center", "space-between", "space-around", "stretch"]);
export type AlignContent = z.infer<typeof AlignContentSchema>;

export const JustifyContentSchema = z.enum(["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"]);
export type JustifyContent = z.infer<typeof JustifyContentSchema>;

export const PositionSchema = z.enum(["relative", "absolute"]);
export type Position = z.infer<typeof PositionSchema>;

export const SpacingSchema = z.object({
  top: z.number().nonnegative().optional(),
  right: z.number().nonnegative().optional(),
  bottom: z.number().nonnegative().optional(),
  left: z.number().nonnegative().optional(),
});
export type Spacing = z.infer<typeof SpacingSchema>;

export const BorderStyleSchema = z.object({
  top: z.boolean().optional(),
  right: z.boolean().optional(),
  bottom: z.boolean().optional(),
  left: z.boolean().optional(),
  color: z.string().optional(),
});
export type BorderStyle = z.infer<typeof BorderStyleSchema>;
