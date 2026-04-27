import React from "react"
import { Box, Text } from "ink"
import { useTheme } from "@/contexts/theme-context"

export interface HelpPanelProps {
  keybindings: Array<{
    keys: string
    description: string
  }>
  onClose?: () => void
}

export const HelpPanel = ({ keybindings, onClose }: HelpPanelProps) => {
  const { theme } = useTheme()

  const maxKeyLength = Math.max(...keybindings.map((kb) => kb.keys.length))

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accentBlue} padding={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text bold color={theme.accentBlue}>
          快捷键帮助
        </Text>
        {onClose && (
          <Text color={theme.comment}>按 Esc 关闭</Text>
        )}
      </Box>

      <Box flexDirection="column">
        {keybindings.map((kb, index) => (
          <Box key={index} flexDirection="row" alignItems="center" paddingY={1}>
            <Text color={theme.accentCyan} bold>
              {kb.keys.padEnd(maxKeyLength, " ")}
            </Text>
            <Text color={theme.gray}> │ </Text>
            <Text>{kb.description}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
