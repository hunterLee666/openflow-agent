import { useCallback, useRef } from 'react'

export function useDoublePress<T extends unknown[]>(
  onFirstPress: (...args: T) => void,
  onSecondPress: (...args: T) => void,
  onTimeout?: () => void,
  delay: number = 300,
): (...args: T) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressCountRef = useRef(0)

  return useCallback(
    (...args: T) => {
      pressCountRef.current++

      if (pressCountRef.current === 1) {
        onFirstPress(...args)

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }

        timeoutRef.current = setTimeout(() => {
          pressCountRef.current = 0
          onTimeout?.()
        }, delay)
      } else if (pressCountRef.current === 2) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        pressCountRef.current = 0
        onSecondPress(...args)
      }
    },
    [onFirstPress, onSecondPress, onTimeout, delay],
  )
}

export function useTriplePress(
  onFirstPress: () => void,
  onSecondPress: () => void,
  onThirdPress: () => void,
  onTimeout: () => void,
  delay: number = 300,
): () => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressCountRef = useRef(0)

  return useCallback(() => {
    pressCountRef.current++

    if (pressCountRef.current === 1) {
      onFirstPress()

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        pressCountRef.current = 0
        onTimeout()
      }, delay)
    } else if (pressCountRef.current === 2) {
      onSecondPress()
    } else if (pressCountRef.current >= 3) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      pressCountRef.current = 0
      onThirdPress()
    }
  }, [onFirstPress, onSecondPress, onThirdPress, onTimeout, delay])
}
