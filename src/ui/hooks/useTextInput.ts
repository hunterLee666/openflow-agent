import { useState, useEffect, useCallback, useRef } from 'react'

export interface CursorPosition {
  offset: number
  line: number
  column: number
}

export interface TextInputState {
  value: string
  cursorPosition: CursorPosition
  selection: { start: number; end: number } | null
  visibleLines: string[]
  scrollOffset: number
}

export function useTextInput({
  value,
  onChange,
  onSubmit,
  onExit,
  multiline = false,
  columns = 80,
  cursorChar = '|',
  maxLines = 100,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  onExit?: () => void
  multiline?: boolean
  columns?: number
  cursorChar?: string
  maxLines?: number
}): TextInputState {
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({ offset: 0, line: 0, column: 0 })
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [scrollOffset, setScrollOffset] = useState(0)

  const updateCursorPosition = useCallback(
    (text: string, offset: number) => {
      const beforeCursor = text.slice(0, offset)
      const lines = beforeCursor.split('\n')
      const line = lines.length - 1
      const column = lines[lines.length - 1]?.length ?? 0
      return { offset, line, column }
    },
    [],
  )

  const visibleLines = value.split('\n').slice(scrollOffset, scrollOffset + maxLines)

  const handleKeyDown = useCallback(
    (key: string, modifiers: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }) => {
      if (modifiers.ctrl && key === 'c') {
        onExit?.()
        return
      }

      if (modifiers.ctrl && key === 'd' && value === '') {
        onExit?.()
        return
      }

      if (modifiers.ctrl && key === 'l') {
        onChange('')
        setCursorPosition({ offset: 0, line: 0, column: 0 })
        return
      }

      if (key === 'Enter' && !modifiers.ctrl && !modifiers.alt && !modifiers.meta) {
        if (multiline) {
          const newValue = value.slice(0, cursorPosition.offset) + '\n' + value.slice(cursorPosition.offset)
          onChange(newValue)
          const newOffset = cursorPosition.offset + 1
          setCursorPosition(updateCursorPosition(newValue, newOffset))
        } else {
          onSubmit?.(value)
        }
        return
      }

      if (key === 'Backspace') {
        if (cursorPosition.offset > 0) {
          const newValue = value.slice(0, cursorPosition.offset - 1) + value.slice(cursorPosition.offset)
          onChange(newValue)
          const newOffset = cursorPosition.offset - 1
          setCursorPosition(updateCursorPosition(newValue, newOffset))
        }
        return
      }

      if (key === 'Delete') {
        if (cursorPosition.offset < value.length) {
          const newValue = value.slice(0, cursorPosition.offset) + value.slice(cursorPosition.offset + 1)
          onChange(newValue)
        }
        return
      }

      if (key === 'ArrowLeft') {
        if (cursorPosition.offset > 0) {
          const newOffset = cursorPosition.offset - 1
          setCursorPosition(updateCursorPosition(value, newOffset))
        }
        return
      }

      if (key === 'ArrowRight') {
        if (cursorPosition.offset < value.length) {
          const newOffset = cursorPosition.offset + 1
          setCursorPosition(updateCursorPosition(value, newOffset))
        }
        return
      }

      if (key === 'ArrowUp') {
        if (cursorPosition.line > 0) {
          const lines = value.split('\n')
          const currentLine = lines[cursorPosition.line]
          const prevLine = lines[cursorPosition.line - 1]
          const newColumn = Math.min(cursorPosition.column, prevLine?.length ?? 0)
          let newOffset = 0
          for (let i = 0; i < cursorPosition.line - 1; i++) {
            newOffset += lines[i].length + 1
          }
          newOffset += newColumn
          setCursorPosition({ offset: newOffset, line: cursorPosition.line - 1, column: newColumn })
        }
        return
      }

      if (key === 'ArrowDown') {
        const lines = value.split('\n')
        if (cursorPosition.line < lines.length - 1) {
          const nextLine = lines[cursorPosition.line + 1]
          const newColumn = Math.min(cursorPosition.column, nextLine?.length ?? 0)
          let newOffset = 0
          for (let i = 0; i < cursorPosition.line + 1; i++) {
            newOffset += lines[i].length + 1
          }
          newOffset += newColumn
          setCursorPosition({ offset: newOffset, line: cursorPosition.line + 1, column: newColumn })
        }
        return
      }

      if (key === 'Home') {
        let offset = 0
        for (let i = 0; i < cursorPosition.line; i++) {
          offset += value.split('\n')[i]!.length + 1
        }
        setCursorPosition({ offset, line: cursorPosition.line, column: 0 })
        return
      }

      if (key === 'End') {
        const lines = value.split('\n')
        const currentLine = lines[cursorPosition.line]
        let offset = 0
        for (let i = 0; i < cursorPosition.line; i++) {
          offset += lines[i]!.length + 1
        }
        offset += currentLine.length
        setCursorPosition({ offset, line: cursorPosition.line, column: currentLine.length })
        return
      }

      if (key === 'Tab') {
        if (multiline) {
          const newValue = value.slice(0, cursorPosition.offset) + '  ' + value.slice(cursorPosition.offset)
          onChange(newValue)
          const newOffset = cursorPosition.offset + 2
          setCursorPosition(updateCursorPosition(newValue, newOffset))
        }
        return
      }

      if (key.length === 1 && !modifiers.ctrl && !modifiers.alt && !modifiers.meta) {
        const newValue = value.slice(0, cursorPosition.offset) + key + value.slice(cursorPosition.offset)
        onChange(newValue)
        const newOffset = cursorPosition.offset + 1
        setCursorPosition(updateCursorPosition(newValue, newOffset))
      }
    },
    [value, cursorPosition, onChange, onSubmit, onExit, multiline, updateCursorPosition],
  )

  useEffect(() => {
    setCursorPosition(updateCursorPosition(value, cursorPosition.offset))
  }, [value, updateCursorPosition, cursorPosition.offset])

  return {
    value,
    cursorPosition,
    selection,
    visibleLines,
    scrollOffset,
  }
}
