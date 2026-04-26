import React, { type ReactNode } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { z } from "zod";

export const StatusLinePropsSchema = z.object({
  left: z.any().optional(),
  center: z.any().optional(),
  right: z.any().optional(),
  separator: z.string().optional(),
})
export type StatusLineProps = z.infer<typeof StatusLinePropsSchema>

export function StatusLine({
  left,
  center,
  right,
  separator = "  ",
}: StatusLineProps): ReactNode {
  return (
    <Box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
      <Box flexDirection="row" alignItems="center">
        {left}
      </Box>
      <Box flexDirection="row" alignItems="center">
        {center}
      </Box>
      <Box flexDirection="row" alignItems="center">
        {right}
      </Box>
    </Box>
  );
}

export default StatusLine;
