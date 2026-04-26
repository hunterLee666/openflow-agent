import { useEffect, useRef, useCallback, useState } from 'react'
import { z } from 'zod'

export const AwaySummaryStateSchema = z.object({
  isAway: z.boolean(),
  lastActiveTime: z.number(),
  awayDuration: z.number(),
  summary: z.string().nullable(),
})
export type AwaySummaryState = z.infer<typeof AwaySummaryStateSchema>

export const UseAwaySummaryOptionsSchema = z.object({
  timeout: z.number().positive().optional(),
  onAway: z.function().returns(z.void()).optional(),
  onReturn: z.function().returns(z.void()).optional(),
  generateSummary: z.function().args(z.number()).returns(z.string()).optional(),
})
export type UseAwaySummaryOptions = z.infer<typeof UseAwaySummaryOptionsSchema>

export function useAwaySummary(options: UseAwaySummaryOptions = {}): AwaySummaryState {
  const { timeout = 300000, onAway, onReturn, generateSummary } = options

  const [state, setState] = useState<AwaySummaryState>({
    isAway: false,
    lastActiveTime: Date.now(),
    awayDuration: 0,
    summary: null,
  })

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasAwayRef = useRef(false)

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (state.isAway && wasAwayRef.current) {
      onReturn?.()
      wasAwayRef.current = false
    }

    setState(prev => ({
      ...prev,
      isAway: false,
      lastActiveTime: Date.now(),
      awayDuration: 0,
      summary: null,
    }))

    timeoutRef.current = setTimeout(() => {
      wasAwayRef.current = true
      onAway?.()
      const awayDuration = 0
      const summary = generateSummary ? generateSummary(awayDuration) : null
      setState(prev => ({
        ...prev,
        isAway: true,
        awayDuration,
        summary,
      }))
    }, timeout)
  }, [timeout, onAway, onReturn, generateSummary, state.isAway])

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']

    const handleActivity = () => {
      resetTimer()
    }

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true })
    })

    resetTimer()

    intervalRef.current = setInterval(() => {
      setState(prev => {
        if (!prev.isAway) return prev
        const awayDuration = Date.now() - prev.lastActiveTime
        const summary = generateSummary ? generateSummary(awayDuration) : prev.summary
        return { ...prev, awayDuration, summary }
      })
    }, 1000)

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity)
      })
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [resetTimer])

  return state
}

export default useAwaySummary