import { useState, useEffect, useRef } from "react"

export function useTextInput(options: {
  maxLength?: number
  placeholder?: string
  onSubmit?: (value: string) => void
  onChange?: (value: string) => void
}) {
  const [value, setValue] = useState("")
  const [cursorPosition, setCursorPosition] = useState(0)
  const [isFocused, setIsFocused] = useState(true)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)

  const updateValue = (newValue: string) => {
    if (options.maxLength && newValue.length > options.maxLength) return
    setValue(newValue)
    options.onChange?.(newValue)
  }

  const submit = () => {
    if (value.trim()) {
      options.onSubmit?.(value)
      historyRef.current.push(value)
      historyIndexRef.current = -1
      setValue("")
      setCursorPosition(0)
    }
  }

  const navigateHistory = (direction: "up" | "down") => {
    if (direction === "up" && historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++
      const historyValue = historyRef.current[historyRef.current.length - 1 - historyIndexRef.current]
      setValue(historyValue)
      setCursorPosition(historyValue.length)
    } else if (direction === "down" && historyIndexRef.current > 0) {
      historyIndexRef.current--
      const historyValue = historyRef.current[historyRef.current.length - 1 - historyIndexRef.current]
      setValue(historyValue)
      setCursorPosition(historyValue.length)
    } else if (direction === "down" && historyIndexRef.current === 0) {
      historyIndexRef.current = -1
      setValue("")
      setCursorPosition(0)
    }
  }

  return {
    value,
    cursorPosition,
    isFocused,
    setValue: updateValue,
    setCursorPosition,
    setIsFocused,
    submit,
    navigateHistory,
  }
}
