import React, { type ReactNode } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { z } from "zod";

export const MessageBubblePropsSchema = z.object({
  children: z.any(),
  role: z.enum(["user", "assistant", "system"]).default("user"),
  timestamp: z.string().optional(),
  tokens: z.number().optional(),
  status: z.enum(["thinking", "streaming", "done", "error"]).optional(),
  maxWidth: z.number().optional(),
})
export type MessageBubbleProps = z.infer<typeof MessageBubblePropsSchema>

const ROLE_COLORS = {
  user: "cyan",
  assistant: "green",
  system: "yellow",
} as const;

const ROLE_LABELS = {
  user: "YOU",
  assistant: "AI",
  system: "SYS",
} as const;

export function MessageBubble({
  children,
  role = "user",
  timestamp,
  tokens,
  status,
  maxWidth,
}: MessageBubbleProps): ReactNode {
  const color = ROLE_COLORS[role];
  const label = ROLE_LABELS[role];

  return (
    <Box flexDirection="column" margin={{ top: 1, bottom: 1 }}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text bold color={color}>
          {label}
        </Text>
        {timestamp && (
          <Text dimColor={true}>
            {timestamp}
          </Text>
        )}
        {tokens !== undefined && (
          <Text dimColor={true}>
            {tokens} tokens
          </Text>
        )}
        {status === "thinking" && (
          <Text color="yellow">
            thinking...
          </Text>
        )}
        {status === "streaming" && (
          <Text color="green">
            streaming...
          </Text>
        )}
        {status === "error" && (
          <Text color="red">
            error
          </Text>
        )}
      </Box>
      <Box
        flexDirection="column"
        paddingLeft={2}
        borderStyle="round"
        borderColor={color}
        width={maxWidth}
      >
        {children}
      </Box>
    </Box>
  );
}

export default MessageBubble;
