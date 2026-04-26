import React, { useEffect, useRef, useState } from 'react'
import Text from '../../components/Text'

type Color =
  | number
  | string
  | 'Black'
  | 'Red'
  | 'Green'
  | 'Yellow'
  | 'Blue'
  | 'Magenta'
  | 'Cyan'
  | 'White'
  | 'BrightBlack'
  | 'BrightRed'
  | 'BrightGreen'
  | 'BrightYellow'
  | 'BrightBlue'
  | 'BrightMagenta'
  | 'BrightCyan'
  | 'BrightWhite'

export interface StreamingTextProps {
  text: string
  color?: Color
  cursor?: string
  interval?: number
  onComplete?: () => void
  showCursorWhenDone?: boolean
}

export default function StreamingText({
  text,
  color,
  cursor = '▊',
  interval = 20,
  onComplete,
  showCursorWhenDone = false,
}: StreamingTextProps): React.ReactElement {
  const [visibleLength, setVisibleLength] = useState(0)
  const onCompleteRef = useRef(onComplete)
  const hasCompletedRef = useRef(false)

  onCompleteRef.current = onComplete

  useEffect(() => {
    setVisibleLength(0)
    hasCompletedRef.current = false
  }, [text])

  useEffect(() => {
    if (visibleLength >= text.length) {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true
        onCompleteRef.current?.()
      }
      return
    }

    const timer = setTimeout(() => {
      setVisibleLength((prev) => Math.min(text.length, prev + 1))
    }, interval)

    return () => clearTimeout(timer)
  }, [visibleLength, text, interval])

  const done = visibleLength >= text.length
  const showCursor = !done || showCursorWhenDone
  const visible = text.slice(0, visibleLength)

  return React.createElement(
    Text,
    { color, block: true },
    visible + (showCursor ? cursor : '')
  )
}
