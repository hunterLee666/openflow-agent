import { useState, useEffect, useCallback, useRef } from 'react'

export interface TypeaheadMatch<T> {
  item: T
  index: number
  match: string
}

export interface UseTypeaheadOptions<T> {
  items: T[]
  getSearchString: (item: T) => string
  onMatch?: (match: TypeaheadMatch<T> | null) => void
  timeout?: number
}

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