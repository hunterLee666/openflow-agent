import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react'
import { useState } from 'react'

export interface FpsMetrics {
  fps: number
  frameTime: number
  avgFrameTime: number
  minFrameTime: number
  maxFrameTime: number
  frames: number
}

interface FpsContextValue {
  metrics: FpsMetrics
  startFrame: () => void
  endFrame: () => void
  reset: () => void
}

const FPS_WINDOW_SIZE = 60

export const FpsContext = createContext<FpsContextValue | null>(null)

export function useFpsMetrics(): FpsMetrics {
  const context = useContext(FpsContext)
  return context?.metrics ?? { fps: 0, frameTime: 0, avgFrameTime: 0, minFrameTime: 0, maxFrameTime: 0, frames: 0 }
}

interface FpsProviderProps {
  children: ReactNode
  targetFps?: number
}

export function FpsProvider({ children }: FpsProviderProps) {
  const frameTimesRef = useRef<number[]>([])
  const lastFrameTimeRef = useRef<number>(performance.now())
  const frameCountRef = useRef<number>(0)
  const startFrameRef = useRef<number>(performance.now())

  const [metrics, setMetrics] = useState<FpsMetrics>({
    fps: 0,
    frameTime: 0,
    avgFrameTime: 0,
    minFrameTime: 0,
    maxFrameTime: 0,
    frames: 0,
  })

  const startFrame = useCallback(() => {
    startFrameRef.current = performance.now()
  }, [])

  const endFrame = useCallback(() => {
    const now = performance.now()
    const frameTime = now - startFrameRef.current

    frameTimesRef.current.push(frameTime)
    if (frameTimesRef.current.length > FPS_WINDOW_SIZE) {
      frameTimesRef.current.shift()
    }

    frameCountRef.current++

    setMetrics(() => {
      const times = frameTimesRef.current
      const sum = times.reduce((a, b) => a + b, 0)
      const avgFrameTime = sum / times.length
      const minFrameTime = Math.min(...times)
      const maxFrameTime = Math.max(...times)
      const fps = times.length > 0 ? 1000 / avgFrameTime : 0

      return {
        fps: Math.round(fps * 10) / 10,
        frameTime: Math.round(frameTime * 100) / 100,
        avgFrameTime: Math.round(avgFrameTime * 100) / 100,
        minFrameTime: Math.round(minFrameTime * 100) / 100,
        maxFrameTime: Math.round(maxFrameTime * 100) / 100,
        frames: frameCountRef.current,
      }
    })

    lastFrameTimeRef.current = now
  }, [])

  const reset = useCallback(() => {
    frameTimesRef.current = []
    frameCountRef.current = 0
    setMetrics({
      fps: 0,
      frameTime: 0,
      avgFrameTime: 0,
      minFrameTime: 0,
      maxFrameTime: 0,
      frames: 0,
    })
  }, [])

  return (
    <FpsContext.Provider value={{ metrics, startFrame, endFrame, reset }}>
      {children}
    </FpsContext.Provider>
  )
}

export default FpsContext