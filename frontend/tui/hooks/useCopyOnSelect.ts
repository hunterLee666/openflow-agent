import { useEffect, useRef, useCallback, useState } from 'react'
import { z } from 'zod'

export const UseCopyOnSelectOptionsSchema = z.object({
  enabled: z.boolean().optional(),
  onCopy: z.function().args(z.string()).returns(z.void()).optional(),
  timeout: z.number().positive().optional(),
})
export type UseCopyOnSelectOptions = z.infer<typeof UseCopyOnSelectOptionsSchema>

export const UseCopyOnSelectReturnSchema = z.object({
  copiedText: z.string().nullable(),
  handleCopy: z.function().args(z.string()).returns(z.void()),
  clearCopied: z.function().returns(z.void()),
})
export type UseCopyOnSelectReturn = z.infer<typeof UseCopyOnSelectReturnSchema>

export function useCopyOnSelect(options: UseCopyOnSelectOptions = {}): {
  copiedText: string | null
  handleCopy: (text: string) => void
  clearCopied: () => void
} {
  const { enabled = true, onCopy, timeout = 2000 } = options

  const [copiedText, setCopiedText] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(
    (text: string) => {
      if (!enabled || !text) return

      navigator.clipboard.writeText(text).then(() => {
        setCopiedText(text)
        onCopy?.(text)

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }

        timeoutRef.current = setTimeout(() => {
          setCopiedText(null)
        }, timeout)
      }).catch((err) => {
        console.warn('Failed to copy to clipboard:', err)
      })
    },
    [enabled, onCopy, timeout]
  )

  const clearCopied = useCallback(() => {
    setCopiedText(null)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const handleSelectionChange = () => {
      const selection = window.getSelection()
      const text = selection?.toString().trim()

      if (text && text.length > 0) {
        const handler = () => {
          const currentSelection = window.getSelection()
          const currentText = currentSelection?.toString().trim()
          if (currentText && currentText !== text) {
            handleCopy(text)
          }
        }

        document.addEventListener('mouseup', handler, { once: true })
        document.addEventListener('keyup', handler, { once: true })
      }
    }

    document.addEventListener('mousedown', handleSelectionChange)

    return () => {
      document.removeEventListener('mousedown', handleSelectionChange)
    }
  }, [enabled, handleCopy])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return { copiedText, handleCopy, clearCopied }
}

export default useCopyOnSelect