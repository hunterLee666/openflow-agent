import { useState, useEffect, useRef, useCallback } from "react"

export function useAnimationFrame(callback: (deltaTime: number) => void, isActive = true) {
  const callbackRef = useRef(callback)
  const frameRef = useRef<ReturnType<typeof setTimeout>>()
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!isActive) return

    const animate = () => {
      const now = Date.now()
      if (!startTimeRef.current) {
        startTimeRef.current = now
      }
      const deltaTime = now - startTimeRef.current
      callbackRef.current(deltaTime)
      frameRef.current = setTimeout(animate, 16)
    }

    frameRef.current = setTimeout(animate, 16)

    return () => {
      if (frameRef.current) {
        clearTimeout(frameRef.current)
      }
      startTimeRef.current = 0
    }
  }, [isActive])
}
