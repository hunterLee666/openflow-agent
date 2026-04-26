import React, { type ReactNode } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { z } from "zod";

export const ModelBadgePropsSchema = z.object({
  provider: z.string(),
  model: z.string(),
  variant: z.enum(["compact", "full"]).default("compact"),
})
export type ModelBadgeProps = z.infer<typeof ModelBadgePropsSchema>

export function ModelBadge({
  provider,
  model,
  variant = "compact",
}: ModelBadgeProps): ReactNode {
  if (variant === "compact") {
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text bold color="cyan">
          {provider}
        </Text>
        <Text dimColor={true}>
          /
        </Text>
        <Text color="green">
          {model}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={0}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text bold color="cyan">
          Provider:
        </Text>
        <Text color="brightWhite">
          {provider}
        </Text>
      </Box>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text bold color="cyan">
          Model:
        </Text>
        <Text color="brightWhite">
          {model}
        </Text>
      </Box>
    </Box>
  );
}

export default ModelBadge;
