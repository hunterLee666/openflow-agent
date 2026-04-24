import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'
import { useTerminalSize } from './useTerminalSize.js'

declare function requestAnimationFrame(callback: (timestamp: number) => void): number
declare function cancelAnimationFrame(id: number): void

export interface Clock {
  now(): number
  subscribe(callback: (time: number) => void, immediate?: boolean): () => void
}

export interface AnimationFrameOptions {
  intervalMs?: number | null
  immediate?: boolean
}

export function useAnimationFrame(
  options: AnimationFrameOptions = {},
): [RefObject<HTMLElement | null>, number] {
  const { intervalMs = 16, immediate = false } = options
  const [time, setTime] = useState(0)
  const terminalSize = useTerminalSize()
  const frameRef = useRef<HTMLElement | null>(null)
  const lastUpdateRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (intervalMs === null) return

    const update = (timestamp: number) => {
      if (timestamp - lastUpdateRef.current >= intervalMs) {
        lastUpdateRef.current = timestamp
        setTime(timestamp)
      }
      animationFrameRef.current = requestAnimationFrame(update)
    }

    if (immediate) {
      lastUpdateRef.current = performance.now()
      setTime(lastUpdateRef.current)
    }

    animationFrameRef.current = requestAnimationFrame(update)

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [intervalMs, immediate])

  return [frameRef as RefObject<HTMLElement | null>, time]
}

export function useAnimationLoop(
  callback: (deltaTime: number) => void,
  options: AnimationFrameOptions = {},
): [RefObject<HTMLElement | null>, () => void] {
  const { intervalMs = 16 } = options
  const terminalSize = useTerminalSize()
  const frameRef = useRef<HTMLElement | null>(null)
  const lastTimeRef = useRef(performance.now())
  const animationFrameRef = useRef<number | null>(null)
  const callbackRef = useRef(callback)
  const isRunningRef = useRef(false)

  callbackRef.current = callback

  const stop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    isRunningRef.current = false
  }, [])

  const start = useCallback(() => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    lastTimeRef.current = performance.now()

    const loop = (timestamp: number) => {
      if (!isRunningRef.current) return

      const deltaTime = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp
      callbackRef.current(deltaTime)

      animationFrameRef.current = requestAnimationFrame(loop)
    }

    animationFrameRef.current = requestAnimationFrame(loop)
  }, [])

  useEffect(() => {
    if (intervalMs !== null) {
      start()
    }

    return () => {
      stop()
    }
  }, [intervalMs, start, stop])

  return [frameRef as RefObject<HTMLElement | null>, stop]
}

export function useTicker(
  callback: (time: number) => void,
  hz: number = 60,
): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const intervalMs = 1000 / hz
    let lastTime = performance.now()
    let animationFrameId: number | null = null

    const tick = (timestamp: number) => {
      if (timestamp - lastTime >= intervalMs) {
        lastTime = timestamp
        callbackRef.current(timestamp)
      }
      animationFrameId = requestAnimationFrame(tick)
    }

    animationFrameId = requestAnimationFrame(tick)

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [hz])
}

export class GlobalClock implements Clock {
  private subscribers = new Set<(time: number) => void>()
  private lastTime = 0
  private animationFrameId: number | null = null
  private running = false

  now(): number {
    return this.lastTime
  }

  subscribe(callback: (time: number) => void, _immediate = false): () => void {
    this.subscribers.add(callback)

    if (!this.running) {
      this.start()
    }

    return () => {
      this.subscribers.delete(callback)
      if (this.subscribers.size === 0) {
        this.stop()
      }
    }
  }

  private start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this.tick()
  }

  private stop(): void {
    this.running = false
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  private tick = (): void => {
    if (!this.running) return
    this.lastTime = performance.now()
    this.subscribers.forEach(cb => cb(this.lastTime))
    this.animationFrameId = requestAnimationFrame(this.tick)
  }
}

export const globalClock = new GlobalClock()
