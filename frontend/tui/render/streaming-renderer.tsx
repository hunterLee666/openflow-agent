import React, { useEffect, useRef, useState } from "react"
import { Box, Text, useStdout } from "ink"
import { useTheme } from "@/contexts/theme-context"

export interface StreamingRendererProps {
  content: string
  isStreaming: boolean
  speed?: number
  onComplete?: () => void
}

export const StreamingRenderer = ({
  content,
  isStreaming,
  speed = 20,
  onComplete,
}: StreamingRendererProps) => {
  const { theme } = useTheme()
  const [displayedContent, setDisplayedContent] = useState("")
  const [currentIndex, setCurrentIndex] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedContent(content)
      setCurrentIndex(content.length)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    if (currentIndex < content.length) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = Math.min(prev + 3, content.length)
          setDisplayedContent(content.slice(0, next))
          if (next >= content.length) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current)
              intervalRef.current = null
            }
            onComplete?.()
          }
          return next
        })
      }, speed)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [content, isStreaming, currentIndex, speed, onComplete])

  return (
    <Box flexDirection="column">
      <Text wrap="wrap">{displayedContent}</Text>
      {isStreaming && currentIndex < content.length && (
        <Box>
          <Text color={theme.accentYellow}>▊</Text>
        </Box>
      )}
    </Box>
  )
}
