import { useState, useEffect } from "react";
import type { TerminalSize } from "../types.js";

const DEFAULT_SIZE: TerminalSize = {
  width: process.stdout?.columns || 80,
  height: process.stdout?.rows || 24,
};

export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>(DEFAULT_SIZE);

  useEffect(() => {
    const updateSize = () => {
      setSize({
        width: process.stdout?.columns || 80,
        height: process.stdout?.rows || 24,
      });
    };

    updateSize();

    if (process.stdout) {
      process.stdout.on("resize", updateSize);
    }

    return () => {
      if (process.stdout) {
        process.stdout.off("resize", updateSize);
      }
    };
  }, []);

  return size;
}

export default useTerminalSize;
