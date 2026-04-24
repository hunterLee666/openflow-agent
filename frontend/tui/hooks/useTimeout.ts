import { useEffect, useRef, useCallback } from 'react'

export interface UseIntervalOptions {
  enabled?: boolean
  immediate?: boolean
}

export function useInterval(
  callback: () => void,
  delay: number | null,
  options: UseIntervalOptions = {},
): void {
  const { enabled = true, immediate = false } = options
  const savedCallback = useRef(callback)
  const timerId = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  const start = useCallback(() => {
    if (timerId.current !== null) return
    if (immediate) {
      savedCallback.current()
    }
    if (delay !== null) {
      timerId.current = setInterval(() => {
        savedCallback.current()
      }, delay)
    }
  }, [delay, immediate])

  const stop = useCallback(() => {
    if (timerId.current !== null) {
      clearInterval(timerId.current)
      timerId.current = null
    }
  }, [])

  useEffect(() => {
    if (enabled && delay !== null) {
      start()
    } else {
      stop()
    }
    return stop
  }, [enabled, delay, start, stop])
}

export function useTimeout(
  callback: () => void,
  delay: number | null,
  enabled: boolean = true,
): void {
  const savedCallback = useRef(callback)
  const timerId = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  const start = useCallback(() => {
    if (timerId.current !== null) return
    if (delay !== null) {
      timerId.current = setTimeout(() => {
        savedCallback.current()
        timerId.current = null
      }, delay)
    }
  }, [delay])

  const stop = useCallback(() => {
    if (timerId.current !== null) {
      clearTimeout(timerId.current)
      timerId.current = null
    }
  }, [])

  useEffect(() => {
    if (enabled) {
      start()
    } else {
      stop()
    }
    return stop
  }, [enabled, start, stop])
}

export function useDebounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  callback: T,
  delay: number,
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args)
        timeoutRef.current = null
      }, delay)
    },
    [callback, delay],
  )
}

export function useThrottle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  callback: T,
  delay: number,
): (...args: Parameters<T>) => void {
  const lastCall = useRef<number>(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now()
      const timeSinceLastCall = now - lastCall.current

      if (timeSinceLastCall >= delay) {
        lastCall.current = now
        callback(...args)
      } else {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => {
          lastCall.current = Date.now()
          callback(...args)
          timeoutRef.current = null
        }, delay - timeSinceLastCall)
      }
    },
    [callback, delay],
  )
}
