import { useEffect, useRef, useCallback } from 'react'

export interface UsePasteHandlerOptions {
  onPaste?: (text: string, event: ClipboardEvent) => void
  enabled?: boolean
}

export function usePasteHandler(options: UsePasteHandlerOptions = {}): void {
  const { onPaste, enabled = true } = options
  const handlerRef = useRef(onPaste)

  useEffect(() => {
    handlerRef.current = onPaste
  }, [onPaste])

  useEffect(() => {
    if (!enabled) return

    const handlePaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text/plain')

      if (text !== undefined) {
        handlerRef.current?.(text, event)
      }
    }

    document.addEventListener('paste', handlePaste)

    return () => {
      document.removeEventListener('paste', handlePaste)
    }
  }, [enabled])
}

export default usePasteHandler