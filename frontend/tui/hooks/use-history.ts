import { useState, useEffect, useRef } from "react"

export function useHistory<T>(maxSize = 100) {
  const [history, setHistory] = useState<T[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isNavigating, setIsNavigating] = useState(false)

  const push = (item: T) => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, currentIndex + 1)
      newHistory.push(item)
      if (newHistory.length > maxSize) {
        newHistory.shift()
      }
      return newHistory
    })
    setCurrentIndex((prev) => Math.min(prev + 1, maxSize - 1))
    setIsNavigating(false)
  }

  const undo = (): T | null => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
      setIsNavigating(true)
      return history[currentIndex - 1]
    }
    return null
  }

  const redo = (): T | null => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex((prev) => prev + 1)
      setIsNavigating(true)
      return history[currentIndex + 1]
    }
    return null
  }

  const canUndo = currentIndex > 0
  const canRedo = currentIndex < history.length - 1

  const clear = () => {
    setHistory([])
    setCurrentIndex(-1)
    setIsNavigating(false)
  }

  return {
    history,
    currentIndex,
    isNavigating,
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
  }
}
