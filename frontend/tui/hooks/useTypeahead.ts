import { useState, useEffect, useCallback, useRef } from 'react'
import { z } from 'zod'

export const TypeaheadMatchSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  item: itemSchema,
  index: z.number().int().nonnegative(),
  match: z.string(),
})
export type TypeaheadMatch<T> = z.infer<ReturnType<typeof TypeaheadMatchSchema<z.ZodType<T>>>>

export const UseTypeaheadOptionsSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  items: z.array(itemSchema),
  getSearchString: z.function().args(itemSchema).returns(z.string()),
  onMatch: z.function().args(z.union([TypeaheadMatchSchema(itemSchema), z.null()])).returns(z.void()).optional(),
  timeout: z.number().positive().optional(),
})
export type UseTypeaheadOptions<T> = z.infer<ReturnType<typeof UseTypeaheadOptionsSchema<z.ZodType<T>>>>

export function useTypeahead<T>({
  items,
  getSearchString,
  onMatch,
  timeout = 500,
}: UseTypeaheadOptions<T>): {
  handleKeyPress: (key: string) => void
  currentMatch: TypeaheadMatch<T> | null
  clearTypeahead: () => void
} {
  const [typedChars, setTypedChars] = useState('')
  const [currentMatch, setCurrentMatch] = useState<TypeaheadMatch<T> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTypeahead = useCallback(() => {
    setTypedChars('')
    setCurrentMatch(null)
    onMatch?.(null)
  }, [onMatch])

  const findMatch = useCallback(
    (chars: string): TypeaheadMatch<T> | null => {
      if (!chars) return null

      const lowerChars = chars.toLowerCase()

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!
        const searchStr = getSearchString(item).toLowerCase()

        if (searchStr.startsWith(lowerChars)) {
          const match: TypeaheadMatch<T> = {
            item,
            index: i,
            match: chars,
          }
          return match
        }
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!
        const searchStr = getSearchString(item).toLowerCase()

        if (searchStr.includes(lowerChars)) {
          const match: TypeaheadMatch<T> = {
            item,
            index: i,
            match: chars,
          }
          return match
        }
      }

      return null
    },
    [items, getSearchString]
  )

  const handleKeyPress = useCallback(
    (key: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      const newChars = typedChars + key
      const match = findMatch(newChars)

      if (match) {
        setTypedChars(newChars)
        setCurrentMatch(match)
        onMatch?.(match)
      } else {
        const fallbackMatch = findMatch(key)
        setTypedChars(fallbackMatch ? key : '')
        setCurrentMatch(fallbackMatch)
        onMatch?.(fallbackMatch)
      }

      timeoutRef.current = setTimeout(() => {
        clearTypeahead()
      }, timeout)
    },
    [typedChars, findMatch, onMatch, timeout, clearTypeahead]
  )

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return { handleKeyPress, currentMatch, clearTypeahead }
}

export default useTypeahead