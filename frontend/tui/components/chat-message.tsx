import React from "react"
import { Box, Text } from "ink"
import { useTheme } from "@/contexts/theme-context"
import type { SenderType, ToolStatus } from "@/types"

export interface ChatMessageProps {
  sender: SenderType
  timestamp: Date
  content: string
  streaming?: boolean
  toolName?: string
  toolStatus?: ToolStatus
}

export const ChatMessage = ({
  sender,
  timestamp,
  content,
  streaming = false,
  toolName,
  toolStatus,
}: ChatMessageProps) => {
  const { theme } = useTheme()

  const getSenderColor = () => {
    switch (sender) {
      case "user":
        return theme.accentBlue
      case "assistant":
        return theme.accentGreen
      case "system":
        return theme.accentYellow
      case "tool":
        return theme.accentPurple
      default:
        return theme.foreground
    }
  }

  const getSenderIcon = () => {
    switch (sender) {
      case "user":
        return "▸"
      case "assistant":
        return "◆"
      case "system":
        return "⚙"
      case "tool":
        return "⚡"
      default:
        return "•"
    }
  }

  const getToolStatusIcon = () => {
    switch (toolStatus) {
      case "running":
        return "⟳"
      case "success":
        return "✓"
      case "error":
        return "✗"
      case "pending":
        return "◌"
      default:
        return ""
    }
  }

  const getToolStatusColor = () => {
    switch (toolStatus) {
      case "running":
        return theme.accentYellow
      case "success":
        return theme.accentGreen
      case "error":
        return theme.accentRed
      case "pending":
        return theme.comment
      default:
        return theme.foreground
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box flexDirection="row" alignItems="center">
        <Text color={getSenderColor()} bold>
          {getSenderIcon()}{" "}
        </Text>
        <Text color={getSenderColor()} bold>
          {sender.toUpperCase()}
        </Text>
        <Text color={theme.comment}> {formatTime(timestamp)}</Text>
        {toolName && (
          <>
            <Text color={theme.comment}> | </Text>
            <Text color={theme.accentPurple}>{toolName}</Text>
            {toolStatus && (
              <>
                <Text color={theme.comment}> </Text>
                <Text color={getToolStatusColor()}>
                  {getToolStatusIcon()} {toolStatus}
                </Text>
              </>
            )}
          </>
        )}
        {streaming && (
          <>
            <Text color={theme.comment}> | </Text>
            <Text color={theme.accentYellow}>⟳ streaming...</Text>
          </>
        )}
      </Box>
      <Box paddingLeft={2}>
        <Text wrap="wrap">{content}</Text>
      </Box>
    </Box>
  )
}
