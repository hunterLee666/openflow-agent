import React, { useState, useEffect, useRef, type ReactNode } from "react";
import { Text } from "./Text.js";
import { z } from "zod";

export const StreamingTextPropsSchema = z.object({
  text: z.string(),
  speed: z.number().positive().optional().default(20),
  onComplete: z.function().returns(z.void()).optional(),
  color: z.string().optional(),
  dimColor: z.boolean().optional(),
  bold: z.boolean().optional(),
})
export type StreamingTextProps = z.infer<typeof StreamingTextPropsSchema>

export function StreamingText({
  text,
  speed = 20,
  onComplete,
  color,
  dimColor,
  bold,
}: StreamingTextProps): ReactNode {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCompleteRef = useRef(false);

  useEffect(() => {
    // Reset when text changes
    setDisplayedText("");
    setCurrentIndex(0);
    isCompleteRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (text.length === 0) {
      onComplete?.();
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= text.length) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          if (!isCompleteRef.current) {
            isCompleteRef.current = true;
            onComplete?.();
          }
          return prev;
        }

        const nextIndex = prev + 1;
        setDisplayedText(text.slice(0, nextIndex));
        return nextIndex;
      });
    }, speed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [text, speed, onComplete]);

  return React.createElement(Text, {
    color,
    dimColor,
    bold,
  }, displayedText);
}

export default StreamingText;
