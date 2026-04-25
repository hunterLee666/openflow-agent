import type { AppState } from "./appState.js";
import type { EffectContext, Effect } from "./effects.js";
import { createSession, updateSessionMeta, type SessionMeta } from "./history.js";

export const SYNC_SESSION_META_DEBOUNCE_MS = 2000;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncedSessionId: string | null = null;
let lastSyncedCwd: string | null = null;

export function createSessionMetaSyncEffect(
  options: {
    projectPath?: string;
    cliVersion?: string;
    model?: string;
    debounceMs?: number;
  } = {}
): Effect {
  const {
    projectPath = process.cwd(),
    cliVersion = "1.0.0",
    model = "default",
    debounceMs = SYNC_SESSION_META_DEBOUNCE_MS,
  } = options;

  return async (ctx: EffectContext) => {
    const { prev, next } = ctx;

    const sessionIdChanged = prev.session.sessionId !== next.session.sessionId;
    const cwdChanged = prev.session.cwd !== next.session.cwd;

    if (!sessionIdChanged && !cwdChanged) return;

    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }

    const newSessionId = next.session.sessionId;
    const newCwd = next.session.cwd;

    syncTimer = setTimeout(async () => {
      try {
        if (sessionIdChanged && newSessionId) {
          const meta: SessionMeta = {
            sessionId: newSessionId,
            projectPath,
            cwd: newCwd,
            cliVersion,
            model,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await createSession(meta);
          lastSyncedSessionId = newSessionId;
          lastSyncedCwd = newCwd;
        } else if (cwdChanged && lastSyncedSessionId) {
          await updateSessionMeta(lastSyncedSessionId, { cwd: newCwd });
          lastSyncedCwd = newCwd;
        }
      } catch (e) {
        console.error("[session-meta-sync]", e);
      }
    }, debounceMs);
  };
}

export function resetSessionMetaSync(): void {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  lastSyncedSessionId = null;
  lastSyncedCwd = null;
}
