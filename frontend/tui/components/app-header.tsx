import React from "react"
import { Box, Text } from "ink"
import { useTheme } from "@/contexts/theme-context"
import { APP_TITLE } from "@/constants"

export interface AppHeaderProps {
  showTheme?: boolean
  showModel?: boolean
  onToggleTheme?: () => void
}

export const AppHeader = ({
  showTheme = true,
  showModel = true,
  onToggleTheme,
}: AppHeaderProps) => {
  const { theme, themeName, setTheme } = useTheme()

  const cycleTheme = () => {
    const themes = ["default", "atomOne", "dracula", "github"]
    const currentIndex = themes.indexOf(themeName)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex] as any)
  }

  return (
    <Box flexDirection="row" justifyContent="space-between" paddingY={1}>
      <Box flexDirection="row" alignItems="center">
        <Text bold color={theme.accentBlue}>
          {APP_TITLE}
        </Text>
        <Text color={theme.comment}> │ </Text>
        <Text color={theme.accentPurple}>
          ◆ OpenFlow
        </Text>
      </Box>

      <Box flexDirection="row" alignItems="center">
        {showTheme && (
          <Box marginRight={2}>
            <Text color={theme.comment}>Theme: </Text>
            <Text color={theme.accentPurple} bold>
              {themeName}
            </Text>
            {onToggleTheme && (
              <Text color={theme.comment}> [t]</Text>
            )}
          </Box>
        )}

        {showModel && (
          <Box>
            <Text color={theme.comment}>Model: </Text>
            <Text color={theme.accentGreen} bold>
              qwen2.5-vl-3b
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
