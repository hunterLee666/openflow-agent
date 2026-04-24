import { useState, useEffect } from 'react'

export interface UseBlinkOptions {
  interval?: number
  enabled?: boolean
}

export function useBlink(options: UseBlinkOptions = {}): boolean {
  const { interval = 530, enabled = true } = options

  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (!enabled) {
      setIsVisible(true)
      return
    }

    let timeoutId: ReturnType<typeof setTimeout>

    const toggle = () => {
      setIsVisible(prev => !prev)
      timeoutId = setTimeout(toggle, interval)
    }

    timeoutId = setTimeout(toggle, interval)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [interval, enabled])

  return isVisible
}

export default useBlink