import { useState, useEffect } from "react"

export function useBlink(interval = 500) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible((prev) => !prev)
    }, interval)

    return () => clearInterval(timer)
  }, [interval])

  return visible
}
