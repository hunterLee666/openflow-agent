import type { Store, Effect, EffectContext } from '../state/types'
import type { AppState } from '../state/appState'
import { getPersistence } from './Persistence'
import {
  shouldPersistConfig,
  shouldPersistSessionMeta,
  shouldPersistUi,
  extractPersistableConfig,
  extractPersistableSessionMeta,
  extractPersistableUi,
  PERSIST_DEBOUNCE_MS,
  SESSION_META_DEBOUNCE_MS,
  UI_PERSIST_DEBOUNCE_MS,
} from './policy'

export function createPersistConfigEffect(): Effect<AppState> {
  const persistence = getPersistence()

  return (ctx: EffectContext<AppState>) => {
    if (!shouldPersistConfig(ctx.prev, ctx.next)) return

    persistence.scheduleFlush(
      'config',
      async () => {
        await persistence.saveConfig(extractPersistableConfig(ctx.next.config))
      },
      PERSIST_DEBOUNCE_MS
    )
  }
}

export function createPersistSessionEffect(): Effect<AppState> {
  const persistence = getPersistence()

  return (ctx: EffectContext<AppState>) => {
    if (!shouldPersistSessionMeta(ctx.prev, ctx.next)) return
    if (!ctx.next.session.sessionId) return

    persistence.scheduleFlush(
      'session',
      async () => {
        await persistence.saveSessionMeta(
          extractPersistableSessionMeta(ctx.next.session),
          ctx.next.session.sessionId
        )
      },
      SESSION_META_DEBOUNCE_MS
    )
  }
}

export function createPersistUiEffect(): Effect<AppState> {
  const persistence = getPersistence()

  return (ctx: EffectContext<AppState>) => {
    if (!shouldPersistUi(ctx.prev, ctx.next)) return

    persistence.scheduleFlush(
      'ui',
      async () => {
        await persistence.saveUi(extractPersistableUi(ctx.next.ui))
      },
      UI_PERSIST_DEBOUNCE_MS
    )
  }
}

export function createPersistenceEffects(): Effect<AppState>[] {
  return [
    createPersistConfigEffect(),
    createPersistSessionEffect(),
    createPersistUiEffect(),
  ]
}

export async function hydrateStateFromPersistence(): Promise<Partial<AppState>> {
  const persistence = getPersistence()
  const [config, ui] = await Promise.all([
    persistence.loadConfig(),
    persistence.loadUi(),
  ])

  return {
    config: config
      ? {
          ...config,
          lastUpdated: Date.now(),
        }
      : undefined,
    ui: ui
      ? {
          ...ui,
          modalStack: [],
          lastActivityAt: Date.now(),
        }
      : undefined,
  }
}
