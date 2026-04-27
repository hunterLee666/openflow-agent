import React from "react"
import { Box, Text } from "ink"
import { useTheme } from "@/contexts/theme-context"
import { SEPARATOR_CHAR } from "@/constants"

export interface StatusBarProps {
  model?: string
  tokens?: number
  connected?: boolean
  showShortcuts?: boolean
}

export const StatusBar = ({
  model = "qwen2.5-vl-3b",
  tokens = 1234,
  connected = true,
  showShortcuts = true,
}: StatusBarProps) => {
  const { theme } = useTheme()

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box>
        <Text color={theme.gray}>{SEPARATOR_CHAR.repeat(60)}</Text>
      </Box>
      <Box flexDirection="row" justifyContent="space-between">
        <Box>
          <Text color={theme.comment}>Model: </Text>
          <Text color={theme.accentGreen}>{model}</Text>
        </Box>
        <Box>
          <Text color={theme.comment}>Tokens: </Text>
          <Text color={theme.accentCyan}>{tokens.toLocaleString()}</Text>
        </Box>
        <Box>
          <Text color={connected ? theme.accentGreen : theme.accentRed}>
            {connected ? "● Connected" : "○ Disconnected"}
          </Text>
        </Box>
      </Box>
      {showShortcuts && (
        <Box>
          <Text color={theme.comment}>
            [Ctrl+P] 命令 [Ctrl+T] 主题 [Ctrl+L] 布局 [Esc] 退出
          </Text>
        </Box>
      )}
    </Box>
  )
}
