import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import { useTheme } from "@/contexts/theme-context"
import { ARROW_CHAR } from "@/constants"

export interface TextInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  placeholder?: string
  isFocused?: boolean
  onFocus?: () => void
  onBlur?: () => void
}

export const TextInput = ({
  value,
  onChange,
  onSubmit,
  placeholder = "输入消息...",
  isFocused = true,
  onFocus,
  onBlur,
}: TextInputProps) => {
  const { theme } = useTheme()
  const [cursorPosition, setCursorPosition] = useState(0)

  useInput(
    (input, key) => {
      if (!isFocused) return

      if (key.return) {
        if (value.trim()) {
          onSubmit(value)
          onChange("")
          setCursorPosition(0)
        }
        return
      }

      if (key.leftArrow) {
        setCursorPosition((prev) => Math.max(0, prev - 1))
        return
      }

      if (key.rightArrow) {
        setCursorPosition((prev) => Math.min(value.length, prev + 1))
        return
      }

      if (key.backspace || key.delete) {
        if (cursorPosition > 0) {
          const newValue = value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
          onChange(newValue)
          setCursorPosition((prev) => prev - 1)
        }
        return
      }

      if (key.escape) {
        onBlur?.()
        return
      }

      if (input.length === 1) {
        const newValue = value.slice(0, cursorPosition) + input + value.slice(cursorPosition)
        onChange(newValue)
        setCursorPosition((prev) => prev + 1)
      }
    },
    { isActive: isFocused }
  )

  const renderValue = () => {
    if (!value && placeholder) {
      return (
        <Text color={theme.comment}>
          {isFocused && <Text inverse>{placeholder[0]}</Text>}
          {placeholder.slice(1)}
        </Text>
      )
    }

    if (!isFocused) {
      return <Text>{value}</Text>
    }

    const beforeCursor = value.slice(0, cursorPosition)
    const atCursor = value[cursorPosition] || " "
    const afterCursor = value.slice(cursorPosition + 1)

    return (
      <Text>
        {beforeCursor}
        <Text inverse>{atCursor}</Text>
        {afterCursor}
      </Text>
    )
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.accentBlue}>{ARROW_CHAR} </Text>
        {renderValue()}
      </Box>
      {isFocused && (
        <Box>
          <Text color={theme.comment}>[Enter] 发送 [Esc] 取消焦点</Text>
        </Box>
      )}
    </Box>
  )
}
