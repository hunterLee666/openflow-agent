import React, { type ReactNode } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { z } from "zod";

export const StatusSegmentSchema = z.object({
  label: z.string(),
  color: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  onClick: z.function().returns(z.void()).optional(),
})
export type StatusSegment = z.infer<typeof StatusSegmentSchema>

export const StatusBarPropsSchema = z.object({
  segments: z.array(StatusSegmentSchema).optional(),
  left: z.any().optional(),
  right: z.any().optional(),
  compact: z.boolean().optional(),
})
export type StatusBarProps = z.infer<typeof StatusBarPropsSchema>

export function StatusBar({
  segments = [],
  left,
  right,
  compact = false,
}: StatusBarProps): ReactNode {
  if (compact) {
    return (
      <Box
        flexDirection="row"
        alignItems="center"
        padding={{ top: "0", bottom: "0", left: 1, right: 1 }}
        style={{ backgroundColor: "#1a1a2e", borderTop: "1px solid #333" }}
      >
        {left && <Box flex={1}>{left}</Box>}
        {right && (
          <Box flexDirection="row" gap={2}>
            {right}
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      padding={1}
      style={{ backgroundColor: "#1a1a2e", borderTop: "1px solid #333" }}
    >
      {left && <Box flex={1}>{left}</Box>}

      {segments.length > 0 && (
        <Box flexDirection="row" gap={2}>
          {segments.map((seg, idx) => (
            <Box key={idx} flexDirection="row" gap={1}>
              {seg.label && (
                <Text color="dim" style={{ fontSize: 10 }}>
                  {seg.label}:
                </Text>
              )}
              <Text color={seg.color || "brightWhite"} style={{ fontSize: 10 }}>
                {seg.value !== undefined ? String(seg.value) : ""}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {right && (
        <Box flexDirection="row" gap={2}>
          {right}
        </Box>
      )}
    </Box>
  );
}

export interface ProgressBarProps {
  progress: number;
  total?: number;
  width?: number;
  showLabel?: boolean;
  color?: string;
  backgroundColor?: string;
}

export function ProgressBar({
  progress,
  total = 100,
  width = 40,
  showLabel = true,
  color = "cyan",
  backgroundColor = "#333",
}: ProgressBarProps): ReactNode {
  const percentage = Math.min(100, Math.max(0, (progress / total) * 100));
  const filledWidth = Math.round((percentage / 100) * width);
  const emptyWidth = width - filledWidth;

  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      <Box flexDirection="row">
        <Text style={{ color }}>{filledWidth > 0 ? "█".repeat(filledWidth) : ""}</Text>
        <Text style={{ color: backgroundColor }}>
          {emptyWidth > 0 ? "░".repeat(emptyWidth) : ""}
        </Text>
      </Box>
      {showLabel && (
        <Text color={color} style={{ fontSize: 10 }}>
          {percentage.toFixed(0)}%
        </Text>
      )}
    </Box>
  );
}

export interface TokenDisplayProps {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  compact?: boolean;
}

export function TokenDisplay({
  inputTokens,
  outputTokens,
  totalTokens,
  compact = false,
}: TokenDisplayProps): ReactNode {
  if (compact) {
    return (
      <Text color="dim" style={{ fontSize: 10 }}>
        {totalTokens.toLocaleString()} tokens
      </Text>
    );
  }

  return (
    <Box flexDirection="row" gap={2}>
      <Box flexDirection="row" gap={1}>
        <Text color="dim" style={{ fontSize: 10 }}>
          IN:
        </Text>
        <Text color="green" style={{ fontSize: 10 }}>
          {inputTokens.toLocaleString()}
        </Text>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Text color="dim" style={{ fontSize: 10 }}>
          OUT:
        </Text>
        <Text color="blue" style={{ fontSize: 10 }}>
          {outputTokens.toLocaleString()}
        </Text>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Text color="dim" style={{ fontSize: 10 }}>
          TOTAL:
        </Text>
        <Text color="brightWhite" style={{ fontSize: 10 }}>
          {totalTokens.toLocaleString()}
        </Text>
      </Box>
    </Box>
  );
}

export interface ModelStatusProps {
  model: string;
  temperature?: number;
  compact?: boolean;
}

export function ModelStatus({
  model,
  temperature,
  compact = false,
}: ModelStatusProps): ReactNode {
  return (
    <Box flexDirection="row" gap={1} alignItems="center">
      <Text color="magenta" style={{ fontSize: 10 }}>
        {model}
      </Text>
      {temperature !== undefined && (
        <Text color="dim" style={{ fontSize: 10 }}>
          (T={temperature})
        </Text>
      )}
    </Box>
  );
}

export default StatusBar;
