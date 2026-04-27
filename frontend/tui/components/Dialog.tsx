import React from "react"
import { Box, Text } from "ink"
import { useTheme } from "@/contexts/theme-context"

export interface DialogProps {
  title: string
  children: React.ReactNode
  onClose?: () => void
  actions?: Array<{
    label: string
    action: () => void
    variant?: "primary" | "secondary" | "danger"
  }>
  width?: number
}

export const Dialog = ({
  title,
  children,
  onClose,
  actions,
  width = 60,
}: DialogProps) => {
  const { theme } = useTheme()

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={theme.accentBlue} width={width}>
      <Box flexDirection="row" justifyContent="space-between" paddingX={2} paddingTop={1}>
        <Text bold color={theme.accentBlue}>
          {title}
        </Text>
        {onClose && (
          <Text color={theme.comment}>[Esc]</Text>
        )}
      </Box>

      <Box paddingX={2} paddingY={1}>
        {children}
      </Box>

      {actions && actions.length > 0 && (
        <Box flexDirection="row" justifyContent="flex-end" paddingX={2} paddingBottom={1}>
          {actions.map((action, index) => (
            <Box key={index} marginLeft={index > 0 ? 1 : 0}>
              <Text
                color={
                  action.variant === "primary"
                    ? theme.accentBlue
                    : action.variant === "danger"
                    ? theme.accentRed
                    : theme.foreground
                }
                bold={action.variant === "primary"}
              >
                {action.label}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
