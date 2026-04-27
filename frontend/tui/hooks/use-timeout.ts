import { useState, useEffect } from "react"

export function useTimeout(callback: () => void, delay: number | null) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (delay === null) {
      setIsReady(false)
      return
    }

    const timer = setTimeout(() => {
      callback()
      setIsReady(true)
    }, delay)

    return () => {
      clearTimeout(timer)
      setIsReady(false)
    }
  }, [callback, delay])

  return isReady
}
