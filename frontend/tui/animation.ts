export type EasingFunction = (t: number) => number

export const easings = {
  linear: (t: number) => t,

  easeInQuad: (t: number) => t * t,

  easeOutQuad: (t: number) => t * (2 - t),

  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),

  easeInCubic: (t: number) => t * t * t,

  easeOutCubic: (t: number) => (--t) * t * t + 1,

  easeInOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),

  easeInQuart: (t: number) => t * t * t * t,

  easeOutQuart: (t: number) => 1 - (--t) * t * t * t,

  easeInOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t),

  easeInExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),

  easeOutExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),

  easeInOutExpo: (t: number) => {
    if (t === 0 || t === 1) return t
    if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2
    return (2 - Math.pow(2, -20 * t + 10)) / 2
  },

  easeInBack: (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return c3 * t * t * t - c1 * t * t
  },

  easeOutBack: (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },

  easeInOutBack: (t: number) => {
    const c1 = 1.70158
    const c2 = c1 * 1.525
    if (t < 0.5) return (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    return (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2
  },

  spring: (t: number) => {
    const c4 = (2 * Math.PI) / 3
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
  },
} as const

export interface TweenOptions {
  duration: number
  easing?: EasingFunction
  onUpdate?: (value: number) => void
  onComplete?: () => void
  autoStart?: boolean
}

export class Tween {
  private value: number = 0
  private startTime: number | null = null
  private isRunning: boolean = false
  private options: Required<TweenOptions>

  constructor(options: TweenOptions) {
    this.options = {
      easing: easings.linear,
      onUpdate: () => {},
      onComplete: () => {},
      autoStart: false,
      ...options,
    }

    if (this.options.autoStart) {
      this.start()
    }
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.startTime = performance.now()
    this.tick()
  }

  stop(): void {
    this.isRunning = false
    this.startTime = null
  }

  reset(): void {
    this.stop()
    this.value = 0
    this.options.onUpdate(0)
  }

  private tick = (): void => {
    if (!this.isRunning || this.startTime === null) return

    const elapsed = performance.now() - this.startTime
    const progress = Math.min(elapsed / this.options.duration, 1)
    const easedProgress = this.options.easing(progress)

    this.value = easedProgress
    this.options.onUpdate(easedProgress)

    if (progress < 1) {
      requestAnimationFrame(this.tick)
    } else {
      this.isRunning = false
      this.options.onComplete?.()
    }
  }

  getValue(): number {
    return this.value
  }

  getIsRunning(): boolean {
    return this.isRunning
  }
}

export function animateValue(
  from: number,
  to: number,
  duration: number,
  easing: EasingFunction = easings.linear,
  onUpdate: (value: number) => void,
  onComplete?: () => void
): Tween {
  return new Tween({
    duration,
    easing,
    autoStart: true,
    onUpdate: (t) => onUpdate(from + (to - from) * t),
    onComplete,
  })
}

export interface SequenceOptions {
  children: Animation[]
  loop?: boolean
  onComplete?: () => void
}

export class Sequence {
  private children: Animation[]
  private isRunning: boolean = false
  private currentIndex: number = 0
  private loop: boolean
  private onComplete?: () => void

  constructor(options: SequenceOptions) {
    this.children = options.children
    this.loop = options.loop ?? false
    this.onComplete = options.onComplete
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.currentIndex = 0
    this.runNext()
  }

  stop(): void {
    this.isRunning = false
    this.children.forEach(child => child.stop())
  }

  private runNext(): void {
    if (!this.isRunning) return

    if (this.currentIndex >= this.children.length) {
      if (this.loop) {
        this.currentIndex = 0
        this.children.forEach(child => child.reset())
        this.runNext()
      } else {
        this.isRunning = false
        this.onComplete?.()
      }
      return
    }

    const child = this.children[this.currentIndex]!
    child.start()

    const originalComplete = child.onComplete
    child.onComplete = () => {
      originalComplete?.()
      this.currentIndex++
      this.runNext()
    }
  }
}

export interface Animation {
  start: () => void
  stop: () => void
  reset: () => void
  onComplete?: () => void
}

export function delay(ms: number, onComplete?: () => void): Animation {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let completed = false

  return {
    start: () => {
      if (completed) return
      timeoutId = setTimeout(() => {
        completed = true
        onComplete?.()
      }, ms)
    },
    stop: () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    },
    reset: () => {
      completed = false
    },
    onComplete,
  }
}

export function parallel(animations: Animation[], onComplete?: () => void): Animation {
  let completedCount = 0
  const total = animations.length

  return {
    start: () => {
      animations.forEach(anim => {
        const originalComplete = anim.onComplete
        anim.onComplete = () => {
          completedCount++
          originalComplete?.()
          if (completedCount >= total) {
            onComplete?.()
          }
        }
        anim.start()
      })
    },
    stop: () => animations.forEach(anim => anim.stop()),
    reset: () => {
      completedCount = 0
      animations.forEach(anim => anim.reset())
    },
    onComplete,
  }
}

export default { easings, Tween, animateValue, Sequence, delay, parallel }