import React, { useState, useEffect } from "react"
import { Box, Text } from "ink"
import { useTheme } from "@/contexts/theme-context"

export interface Notification {
  id: string
  type: "info" | "success" | "warning" | "error"
  message: string
  timestamp: number
  duration?: number
}

export interface NotificationPanelProps {
  notifications: Notification[]
  onDismiss: (id: string) => void
  maxVisible?: number
}

export const NotificationPanel = ({
  notifications,
  onDismiss,
  maxVisible = 5,
}: NotificationPanelProps) => {
  const { theme } = useTheme()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      notifications.forEach((n) => {
        if (!dismissed.has(n.id) && now - n.timestamp > (n.duration ?? 5000)) {
          setDismissed((prev) => new Set([...prev, n.id]))
        }
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [notifications, dismissed])

  const visibleNotifications = notifications
    .filter((n) => !dismissed.has(n.id))
    .slice(0, maxVisible)

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "info":
        return "ℹ"
      case "success":
        return "✓"
      case "warning":
        return "⚠"
      case "error":
        return "✗"
    }
  }

  const getColor = (type: Notification["type"]) => {
    switch (type) {
      case "info":
        return theme.accentBlue
      case "success":
        return theme.accentGreen
      case "warning":
        return theme.accentYellow
      case "error":
        return theme.accentRed
    }
  }

  if (visibleNotifications.length === 0) return null

  return (
    <Box flexDirection="column" position="absolute" bottom={4} right={1}>
      {visibleNotifications.map((notification) => (
        <Box
          key={notification.id}
          flexDirection="row"
          alignItems="center"
          paddingX={1}
          marginBottom={1}
        >
          <Text color={getColor(notification.type)}>
            {getIcon(notification.type)}{" "}
          </Text>
          <Text>{notification.message}</Text>
        </Box>
      ))}
    </Box>
  )
}
