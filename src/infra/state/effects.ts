import type { Effect, EffectContext } from './types'
import type { Store, Action } from './types'

export function attachSideEffects<S>(
  store: Store<S> & { getLastAction?: () => Action | null },
  effects: Effect<S>[]
): () => void {
  let prev = store.getState()

  return store.subscribe(() => {
    const next = store.getState()
    const action = store.getLastAction?.() ?? null
    const ctx: EffectContext<S> = { action: action ?? { type: 'UNKNOWN' }, prev, next }

    for (const fx of effects) {
      void Promise.resolve(fx(ctx)).catch((e) => {
        console.error('[effect error]', e)
      })
    }

    prev = next
  })
}

export function createEffect<S>(
  condition: (ctx: EffectContext<S>) => boolean,
  effect: (ctx: EffectContext<S>) => Promise<void> | void
): Effect<S> {
  return async (ctx: EffectContext<S>) => {
    if (condition(ctx)) {
      await effect(ctx)
    }
  }
}

export function whenActionType<S>(
  actionType: string,
  effect: (ctx: EffectContext<S>) => Promise<void> | void
): Effect<S> {
  return createEffect(
    (ctx) => ctx.action.type === actionType,
    effect
  )
}

export function whenStateChanged<S>(
  selector: (state: S) => unknown,
  effect: (ctx: EffectContext<S>) => Promise<void> | void
): Effect<S> {
  return createEffect(
    (ctx) => selector(ctx.prev) !== selector(ctx.next),
    effect
  )
}

export function debounceEffect<S>(
  effect: Effect<S>,
  waitMs: number
): Effect<S> {
  let timer: NodeJS.Timeout | null = null
  let pendingCtx: EffectContext<S> | null = null

  return (ctx: EffectContext<S>) => {
    pendingCtx = ctx
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(async () => {
      if (pendingCtx) {
        await effect(pendingCtx)
        pendingCtx = null
      }
    }, waitMs)
  }
}

export function throttleEffect<S>(
  effect: Effect<S>,
  limitMs: number
): Effect<S> {
  let lastRun = 0
  let pendingCtx: EffectContext<S> | null = null
  let timer: NodeJS.Timeout | null = null

  return (ctx: EffectContext<S>) => {
    pendingCtx = ctx
    const now = Date.now()
    const timeSinceLastRun = now - lastRun

    if (timeSinceLastRun >= limitMs) {
      lastRun = now
      void effect(ctx)
    } else if (!timer) {
      timer = setTimeout(() => {
        if (pendingCtx) {
          lastRun = Date.now()
          void effect(pendingCtx)
          pendingCtx = null
        }
        timer = null
      }, limitMs - timeSinceLastRun)
    }
  }
}

export function batchEffects<S>(effects: Effect<S>[]): Effect<S> {
  return async (ctx: EffectContext<S>) => {
    await Promise.all(effects.map((fx) => Promise.resolve(fx(ctx))))
  }
}
