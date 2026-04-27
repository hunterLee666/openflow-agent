import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import { useTheme } from "@/contexts/theme-context"

export interface TabItem {
  id: string
  label: string
  badge?: number
}

export interface TabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (id: string) => void
}

export const Tabs = ({ tabs, activeTab, onChange }: TabsProps) => {
  const { theme } = useTheme()
  const [hoverIndex, setHoverIndex] = useState(-1)

  useInput((input, key) => {
    if (key.leftArrow) {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab)
      const newIndex = Math.max(0, currentIndex - 1)
      onChange(tabs[newIndex].id)
    }

    if (key.rightArrow) {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab)
      const newIndex = Math.min(tabs.length - 1, currentIndex + 1)
      onChange(tabs[newIndex].id)
    }

    const num = parseInt(input, 10)
    if (!isNaN(num) && num >= 1 && num <= tabs.length) {
      onChange(tabs[num - 1].id)
    }
  })

  return (
    <Box flexDirection="row">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTab
        const isHovered = index === hoverIndex

        return (
          <Box
            key={tab.id}
            flexDirection="row"
            alignItems="center"
            marginRight={1}
          >
            <Text
              color={isActive ? theme.accentBlue : isHovered ? theme.foreground : theme.comment}
              bold={isActive}
              underline={isActive}
            >
              {index + 1}. {tab.label}
            </Text>
            {tab.badge !== undefined && tab.badge > 0 && (
              <Text color={theme.accentYellow}> ({tab.badge})</Text>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
