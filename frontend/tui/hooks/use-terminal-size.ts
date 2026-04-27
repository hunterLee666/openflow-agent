import { useState, useEffect } from "react"

export function useTerminalSize() {
  const [size, setSize] = useState({
    rows: process.stdout.rows || 24,
    columns: process.stdout.columns || 80,
  })

  useEffect(() => {
    const updateSize = () => {
      setSize({
        rows: process.stdout.rows || 24,
        columns: process.stdout.columns || 80,
      })
    }
    updateSize()
    process.stdout.on("resize", updateSize)
    return () => {
      process.stdout.off("resize", updateSize)
    }
  }, [])

  return size
}
