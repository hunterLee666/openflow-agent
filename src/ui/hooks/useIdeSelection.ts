import { useState, useEffect, useCallback } from 'react'

export interface IdeSelection {
  text: string
  startLine: number
  endLine: number
  filePath?: string
}

export interface UseIdeSelectionOptions {
  enabled?: boolean
  onSelectionChange?: (selection: IdeSelection | null) => void
}

export function useIdeSelection(options: UseIdeSelectionOptions = {}): IdeSelection | null {
  const { enabled = true, onSelectionChange } = options

  const [selection, setSelection] = useState<IdeSelection | null>(null)

  const handleSelectionChange = useCallback(() => {
    if (!enabled) {
      setSelection(null)
      return
    }

    const sel = window.getSelection()
    const text = sel?.toString() || ''

    if (text.trim()) {
      let startLine = 1
      let endLine = 1

      const range = sel?.rangeCount ? sel.getRangeAt(0) : null
      if (range) {
        const container = range.commonAncestorContainer
        const element = container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : container as Element

        if (element) {
          const lines = text.split('\n')
          startLine = parseInt(element.getAttribute('data-line') || '1', 10)
          endLine = startLine + lines.length - 1
        }
      }

      const newSelection: IdeSelection = { text, startLine, endLine }
      setSelection(newSelection)
      onSelectionChange?.(newSelection)
    } else {
      setSelection(null)
      onSelectionChange?.(null)
    }
  }, [enabled, onSelectionChange])

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('mouseup', handleSelectionChange)
    document.addEventListener('keyup', handleSelectionChange)

    return () => {
      document.removeEventListener('mouseup', handleSelectionChange)
      document.removeEventListener('keyup', handleSelectionChange)
    }
  }, [enabled, handleSelectionChange])

  return selection
}

export default useIdeSelection