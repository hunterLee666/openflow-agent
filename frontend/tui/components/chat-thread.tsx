import React, { useState, useEffect, useRef } from "react"
import { Box, Text } from "ink"
import type { ReactNode } from "react"
import { useTheme } from "@/contexts/theme-context"

export interface ChatThreadProps {
  maxHeight?: number
  autoScroll?: boolean
  children?: ReactNode
}

export const ChatThread = ({
  maxHeight,
  autoScroll = true,
  children,
}: ChatThreadProps) => {
  void autoScroll
  const { theme } = useTheme()
  const [scrollOffset, setScrollOffset] = useState(0)
  const containerHeight = maxHeight || 16
  const prevCountRef = useRef(0)

  const childrenArray = React.Children.toArray(children)
  const totalMessages = childrenArray.length
  const maxScroll = Math.max(0, totalMessages - containerHeight)

  useEffect(() => {
    if (totalMessages > prevCountRef.current) {
      setScrollOffset(0)
    }
    prevCountRef.current = totalMessages
  }, [totalMessages])

  const effectiveOffset = Math.min(scrollOffset, maxScroll)
  const startIndex = Math.max(0, totalMessages - containerHeight - effectiveOffset)
  const visibleMessages = childrenArray.slice(startIndex, startIndex + containerHeight)

  const showScrollIndicator = totalMessages > containerHeight

  return (
    <Box flexDirection="column" height={containerHeight}>
      <Box flexDirection="column">
        {visibleMessages}
      </Box>
      {showScrollIndicator && (
        <Box justifyContent="flex-end">
          <Text color={theme.comment}>
            ↑↓ 滚动 | {maxScroll > 0 ? Math.round(((maxScroll - effectiveOffset) / maxScroll) * 100) : 100}%
          </Text>
        </Box>
      )}
    </Box>
  )
}
