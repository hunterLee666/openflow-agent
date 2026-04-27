import React from "react"
import { Box, Text } from "ink"
import { useTheme } from "@/contexts/theme-context"

export interface ToolCallProps {
  toolName: string
  status: "running" | "success" | "error" | "pending"
  output?: string
  duration?: number
  collapsed?: boolean
  onToggle?: () => void
}

export const ToolCall = ({
  toolName,
  status,
  output,
  duration,
  collapsed = true,
  onToggle,
}: ToolCallProps) => {
  const { theme } = useTheme()

  const getStatusIcon = () => {
    switch (status) {
      case "running":
        return "⟳"
      case "success":
        return "✓"
      case "error":
        return "✗"
      case "pending":
        return "◌"
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case "running":
        return theme.accentYellow
      case "success":
        return theme.accentGreen
      case "error":
        return theme.accentRed
      case "pending":
        return theme.comment
    }
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return ""
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box flexDirection="row" alignItems="center">
        <Text color={getStatusColor()}>
          {getStatusIcon()}{" "}
        </Text>
        <Text color={theme.accentPurple} bold>
          {toolName}
        </Text>
        {duration && (
          <Text color={theme.comment}> ({formatDuration(duration)})</Text>
        )}
        {output && (
          <Text color={theme.comment}> {collapsed ? "[+]" : "[-]"}</Text>
        )}
      </Box>

      {!collapsed && output && (
        <Box paddingLeft={2} flexDirection="column">
          <Text color={theme.gray}>{output}</Text>
        </Box>
      )}
    </Box>
  )
}
