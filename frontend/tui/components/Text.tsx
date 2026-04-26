import React, { type ReactNode } from "react";
import { Text as InkText } from "ink";
import { z } from "zod";

export const TextPropsSchema = z.object({
  children: z.any(),
  bold: z.boolean().optional(),
  dim: z.boolean().optional(),
  dimColor: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  inverse: z.boolean().optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  wrap: z.enum(["wrap", "truncate", "truncate-start", "truncate-middle", "truncate-end"]).optional(),
})
export type TextProps = z.infer<typeof TextPropsSchema>

export function Text({
  children,
  bold,
  dim,
  dimColor,
  italic,
  underline,
  strikethrough,
  inverse,
  color,
  backgroundColor,
  wrap,
}: TextProps): ReactNode {
  const content = children !== undefined && children !== null ? String(children) : null;
  
  if (content === null) {
    return null;
  }

  return React.createElement(InkText, {
    color: color as any,
    backgroundColor: backgroundColor as any,
    bold,
    dimColor: dim || dimColor,
    italic,
    underline,
    strikethrough,
    inverse,
    wrap,
  }, content);
}

export default Text;
