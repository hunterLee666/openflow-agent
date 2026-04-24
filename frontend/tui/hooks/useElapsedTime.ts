import { useState, useEffect, useRef, useCallback } from 'react'

export interface UseElapsedTimeOptions {
  autoStart?: boolean
  updateInterval?: number
}

export interface UseElapsedTimeReturn {
  elapsed: number
  start: () => void
  stop: () => void
  reset: () => void
  isRunning: boolean
}

export function useElapsedTime(options: UseElapsedTimeOptions = {}): UseElapsedTimeReturn {
  const { autoStart = false, updateInterval = 100 } = options

  const [elapsed, setElapsed] = useState(0)
  const [isRunning, setIsRunning] = useState(autoStart)
  const startTimeRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pausedElapsedRef = useRef(0)

  const start = useCallback(() => {
    if (isRunning) return

    startTimeRef.current = Date.now()
    setIsRunning(true)

    intervalRef.current = setInterval(() => {
      if (startTimeRef.current !== null) {
        const currentElapsed = Date.now() - startTimeRef.current
        setElapsed(pausedElapsedRef.current + currentElapsed)
      }
    }, updateInterval)
  }, [isRunning, updateInterval])

  const stop = useCallback(() => {
    if (!isRunning) return

    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    pausedElapsedRef.current = elapsed
    startTimeRef.current = null
    setIsRunning(false)
  }, [isRunning, elapsed])

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    startTimeRef.current = null
    pausedElapsedRef.current = 0
    setElapsed(0)
    setIsRunning(false)
  }, [])

  useEffect(() => {
    if (autoStart && !isRunning) {
      start()
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [autoStart, isRunning, start])

  return { elapsed, start, stop, reset, isRunning }
}

export default useElapsedTime