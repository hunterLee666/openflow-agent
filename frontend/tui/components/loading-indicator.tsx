import React, { useState, useEffect } from "react"
import { Text } from "ink"
import { useTheme } from "@/contexts/theme-context"
import { LOADING_FRAMES } from "@/constants"

export interface LoadingIndicatorProps {
  message?: string
  frames?: string[]
  interval?: number
}

export const LoadingIndicator = ({
  message = "Thinking",
  frames = LOADING_FRAMES,
  interval = 80,
}: LoadingIndicatorProps) => {
  const [frameIndex, setFrameIndex] = useState(0)
  const { theme } = useTheme()

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length)
    }, interval)
    return () => clearInterval(timer)
  }, [frames, interval])

  return (
    <Text>
      <Text color={theme.accentYellow}>{frames[frameIndex]}</Text>
      <Text color={theme.comment}> {message}...</Text>
    </Text>
  )
}
