import { useState, useCallback } from "react"

export function useCopyOnSelect() {
  const [selectedText, setSelectedText] = useState("")
  const [copiedText, setCopiedText] = useState("")

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      if (typeof globalThis !== "undefined" && (globalThis as any).navigator?.clipboard) {
        await (globalThis as any).navigator.clipboard.writeText(text)
      }
      setCopiedText(text)
      return true
    } catch (error) {
      console.error("Failed to copy:", error)
      return false
    }
  }, [])

  const clearCopied = useCallback(() => {
    setCopiedText("")
  }, [])

  return {
    selectedText,
    copiedText,
    setSelectedText,
    copyToClipboard,
    clearCopied,
  }
}
