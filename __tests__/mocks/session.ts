import type { AppMessage } from "../../src/core/query-engine-config.js";

export function createSessionStoreMock() {
  const sessions = new Map<string, AppMessage[]>();

  return {
    createThread: async () => `thread_${Date.now()}`,
    loadMessages: async (threadId: string) => sessions.get(threadId) || [],
    saveMessages: async (threadId: string, messages: AppMessage[]) => {
      sessions.set(threadId, messages);
    },
    deleteThread: async (threadId: string) => {
      sessions.delete(threadId);
    },
    listThreads: async () =>
      Array.from(sessions.keys()).map((id) => ({
        id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: sessions.get(id)?.length || 0,
      })),
    clear: () => {
      sessions.clear();
    },
    _getSessions: () => sessions,
  };
}

export type MockSessionStore = ReturnType<typeof createSessionStoreMock>;
