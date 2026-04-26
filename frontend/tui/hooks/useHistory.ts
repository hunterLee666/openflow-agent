import { useState, useEffect, useCallback, useRef } from 'react'
import { z } from 'zod'

export const UseHistoryOptionsSchema = <T extends z.ZodTypeAny>(
  itemSchema: T
) => z.object({
  maxSize: z.number().int().positive().optional(),
  onNavigate: z.function().args(
    z.union([itemSchema, z.null()]),
    z.number().int()
  ).returns(z.void()).optional(),
})
export type UseHistoryOptions<T> = z.infer<ReturnType<typeof UseHistoryOptionsSchema<z.ZodType<T>>>>

export const UseHistoryReturnSchema = <T extends z.ZodTypeAny>(
  itemSchema: T
) => z.object({
  history: z.array(itemSchema).readonly(),
  historyIndex: z.number().int(),
  push: z.function().args(itemSchema).returns(z.void()),
  goBack: z.function().returns(z.union([itemSchema, z.null()])),
  goForward: z.function().returns(z.union([itemSchema, z.null()])),
  goTo: z.function().args(z.number().int()).returns(z.union([itemSchema, z.null()])),
  reset: z.function().returns(z.void()),
  clear: z.function().returns(z.void()),
})
export type UseHistoryReturn<T> = z.infer<ReturnType<typeof UseHistoryReturnSchema<z.ZodType<T>>>>

export function useHistory<T>(options: UseHistoryOptions<T> = {}): UseHistoryReturn<T> {
  const { maxSize = 100, onNavigate } = options
  const [history, setHistory] = useState<T[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const currentInputRef = useRef<T | null>(null)

  const push = useCallback(
    (item: T) => {
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1)
        newHistory.push(item)
        if (newHistory.length > maxSize) {
          newHistory.shift()
          return newHistory
        }
        return newHistory
      })
      setHistoryIndex(prev => Math.min(prev + 1, maxSize - 1))
      currentInputRef.current = null
    },
    [historyIndex, maxSize],
  )

  const goBack = useCallback((): T | null => {
    if (historyIndex < 0) return null
    if (historyIndex === history.length - 1) {
      currentInputRef.current = history[history.length - 1] as T
    }
    const newIndex = historyIndex - 1
    setHistoryIndex(newIndex)
    const item = newIndex >= 0 ? history[newIndex] : null
    onNavigate?.(item as T | null, newIndex)
    return item as T | null
  }, [history, historyIndex, onNavigate])

  const goForward = useCallback((): T | null => {
    if (historyIndex >= history.length - 1) {
      setHistoryIndex(history.length)
      const item = currentInputRef.current
      currentInputRef.current = null
      onNavigate?.(item as T | null, history.length)
      return item as T | null
    }
    const newIndex = historyIndex + 1
    setHistoryIndex(newIndex)
    const item = history[newIndex]
    onNavigate?.(item as T, newIndex)
    return item as T
  }, [history, historyIndex, onNavigate])

  const goTo = useCallback(
    (index: number): T | null => {
      if (index < 0 || index >= history.length) return null
      setHistoryIndex(index)
      const item = history[index]
      onNavigate?.(item as T, index)
      return item as T
    },
    [history, onNavigate],
  )

  const reset = useCallback(() => {
    if (currentInputRef.current !== null) {
      onNavigate?.(currentInputRef.current as T, historyIndex)
    }
    setHistoryIndex(history.length)
    currentInputRef.current = null
  }, [history.length, historyIndex, onNavigate])

  const clear = useCallback(() => {
    setHistory([])
    setHistoryIndex(-1)
    currentInputRef.current = null
  }, [])

  return {
    history,
    historyIndex,
    push,
    goBack,
    goForward,
    goTo,
    reset,
    clear,
  }
}
