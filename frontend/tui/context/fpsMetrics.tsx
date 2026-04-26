import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';
import { useState } from 'react';
import { z } from 'zod';

export const FpsMetricsSchema = z.object({
  fps: z.number(),
  frameTime: z.number(),
  avgFrameTime: z.number(),
  minFrameTime: z.number(),
  maxFrameTime: z.number(),
  frames: z.number().int().nonnegative(),
});
export type FpsMetrics = z.infer<typeof FpsMetricsSchema>;

interface FpsContextValue {
  metrics: FpsMetrics;
  startFrame: () => void;
  endFrame: () => void;
  reset: () => void;
}

const FPS_WINDOW_SIZE = 60;

export const FpsContext = createContext<FpsContextValue | null>(null);

export function useFpsMetrics(): FpsMetrics {
  const context = useContext(FpsContext);
  return context?.metrics ?? { fps: 0, frameTime: 0, avgFrameTime: 0, minFrameTime: 0, maxFrameTime: 0, frames: 0 };
}

interface FpsProviderProps {
  children: ReactNode;
  targetFps?: number;
}

export function FpsProvider({ children }: FpsProviderProps) {
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef<number>(0);
  const startFrameRef = useRef<number>(performance.now());

  const [metrics, setMetrics] = useState<FpsMetrics>({
    fps: 0,
    frameTime: 0,
    avgFrameTime: 0,
    minFrameTime: 0,
    maxFrameTime: 0,
    frames: 0,
  });

  const startFrame = useCallback(() => {
    startFrameRef.current = performance.now();
  }, []);

  const endFrame = useCallback(() => {
    const now = performance.now();
    const frameTime = now - startFrameRef.current;
    lastFrameTimeRef.current = now;

    frameTimesRef.current.push(frameTime);
    if (frameTimesRef.current.length > FPS_WINDOW_SIZE) {
      frameTimesRef.current.shift();
    }

    const sum = frameTimesRef.current.reduce((a, b) => a + b, 0);
    const avgFrameTime = sum / frameTimesRef.current.length;
    const fps = 1000 / avgFrameTime;

    frameCountRef.current++;
    const validatedMetrics = FpsMetricsSchema.safeParse({
      fps: Math.round(fps),
      frameTime: Math.round(frameTime),
      avgFrameTime: Math.round(avgFrameTime),
      minFrameTime: Math.round(Math.min(...frameTimesRef.current)),
      maxFrameTime: Math.round(Math.max(...frameTimesRef.current)),
      frames: frameCountRef.current,
    });

    if (validatedMetrics.success) {
      setMetrics(validatedMetrics.data);
    }
  }, []);

  const reset = useCallback(() => {
    frameTimesRef.current = [];
    frameCountRef.current = 0;
    setMetrics({
      fps: 0,
      frameTime: 0,
      avgFrameTime: 0,
      minFrameTime: 0,
      maxFrameTime: 0,
      frames: 0,
    });
  }, []);

  return (
    <FpsContext.Provider value={{ metrics, startFrame, endFrame, reset }}>
      {children}
    </FpsContext.Provider>
  );
}

export default FpsContext;
