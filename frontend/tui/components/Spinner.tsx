import React, { type ReactNode, useEffect, useState } from "react";
import { Text } from "./Text.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_FRAMES_REVERSE = [...SPINNER_FRAMES].reverse();

export interface SpinnerProps {
  frames?: string[];
  interval?: number;
  color?: string;
  label?: string;
}

export function Spinner({
  frames = SPINNER_FRAMES,
  interval = 80,
  color = "cyan",
  label,
}: SpinnerProps): ReactNode {
  const [frameIndex, setFrameIndex] = useState(0);
  const allFrames = [...frames, ...frames.slice().reverse().slice(1, -1)];

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % allFrames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [interval, allFrames.length]);

  return (
    <Text color={color}>
      {allFrames[frameIndex]}
      {label && ` ${label}`}
    </Text>
  );
}

export default Spinner;
