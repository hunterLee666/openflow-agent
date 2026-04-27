export interface AnimationConfig {
  duration: number
  easing: "linear" | "easeIn" | "easeOut" | "easeInOut"
  delay?: number
}

export const EASING_FUNCTIONS = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t * t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
}

export function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress
}

export function animate(
  from: number,
  to: number,
  config: AnimationConfig,
  onUpdate: (value: number) => void,
  onComplete?: () => void
): () => void {
  const startTime = Date.now()
  const delay = config.delay ?? 0
  let animationId: ReturnType<typeof setTimeout>

  const step = () => {
    const elapsed = Date.now() - startTime - delay

    if (elapsed < 0) {
      animationId = setTimeout(step, 16)
      return
    }

    const duration = config.duration
    const rawProgress = Math.min(elapsed / duration, 1)
    const easing = EASING_FUNCTIONS[config.easing]
    const progress = easing(rawProgress)

    const value = interpolate(from, to, progress)
    onUpdate(value)

    if (rawProgress < 1) {
      animationId = setTimeout(step, 16)
    } else {
      onComplete?.()
    }
  }

  animationId = setTimeout(step, 16)

  return () => clearTimeout(animationId)
}

export function createAnimationSequence(
  animations: Array<{
    from: number
    to: number
    config: AnimationConfig
    onUpdate: (value: number) => void
  }>
): () => void {
  let cancelCurrent: (() => void) | null = null
  let isCancelled = false

  const runNext = (index: number) => {
    if (index >= animations.length || isCancelled) return

    const { from, to, config, onUpdate } = animations[index]

    cancelCurrent = animate(
      from,
      to,
      config,
      onUpdate,
      () => {
        cancelCurrent = null
        runNext(index + 1)
      }
    )
  }

  runNext(0)

  return () => {
    isCancelled = true
    cancelCurrent?.()
  }
}

export const ANIMATIONS = {
  fadeIn: {
    duration: 200,
    easing: "easeOut" as const,
  },
  fadeOut: {
    duration: 150,
    easing: "easeIn" as const,
  },
  slideIn: {
    duration: 250,
    easing: "easeOut" as const,
  },
  slideOut: {
    duration: 200,
    easing: "easeIn" as const,
  },
  scale: {
    duration: 150,
    easing: "easeInOut" as const,
  },
} as const
