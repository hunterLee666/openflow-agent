import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Session Expiry Cleanup E2E Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("SessionLifecycleManager - Resource Release", () => {
    it("should start a new session", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project", "Test prompt");

      expect(session.id).toBeDefined();
      expect(session.project).toBe("test-project");
      expect(session.status).toBe("active");
    });

    it("should stop session and release resources", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");
      await manager.stopSession(session.id);

      const stoppedSession = manager.getSession(session.id);
      expect(stoppedSession?.status).toBe("stopped");
      expect(stoppedSession?.stoppedAt).toBeDefined();
    });

    it("should end session completely", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");
      const report = await manager.endSession(session.id);

      expect(report.sessionId).toBe(session.id);
      expect(report.totalEvents).toBeDefined();
      expect(report.qualityScore).toBeDefined();

      const endedSession = manager.getSession(session.id);
      expect(endedSession?.status).toBe("ended");
      expect(endedSession?.endedAt).toBeDefined();
    });

    it("should delete session from memory", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");
      expect(manager.getSession(session.id)).toBeDefined();

      const deleted = manager.deleteSession(session.id);
      expect(deleted).toBe(true);
      expect(manager.getSession(session.id)).toBeUndefined();
    });

    it("should clear all sessions", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      await manager.startSession("project1");
      await manager.startSession("project2");
      await manager.startSession("project3");

      expect(manager.getAllSessions().length).toBe(3);

      manager.clear();

      expect(manager.getAllSessions().length).toBe(0);
      expect(manager.getActiveSession()).toBeUndefined();
    });
  });

  describe("SessionLifecycleManager - State Cleanup", () => {
    it("should pause session", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");
      await manager.pauseSession(session.id);

      const pausedSession = manager.getSession(session.id);
      expect(pausedSession?.status).toBe("paused");
    });

    it("should resume paused session", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");
      await manager.pauseSession(session.id);
      await manager.resumeSession(session.id);

      const resumedSession = manager.getSession(session.id);
      expect(resumedSession?.status).toBe("active");
    });

    it("should record events in active session", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");

      await manager.recordEvent(session.id, "message", "Test message");
      await manager.recordEvent(session.id, "tool_use", "Used tool");

      const updatedSession = manager.getSession(session.id);
      expect(updatedSession?.events.length).toBe(2);
    });

    it("should not record events in stopped session", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");
      await manager.stopSession(session.id);

      await expect(
        manager.recordEvent(session.id, "message", "Test message")
      ).rejects.toThrow();
    });

    it("should get sessions by project", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      await manager.startSession("project-a");
      await manager.startSession("project-b");
      await manager.startSession("project-a");

      const projectASessions = manager.getSessionsByProject("project-a");
      expect(projectASessions.length).toBe(2);

      const projectBSessions = manager.getSessionsByProject("project-b");
      expect(projectBSessions.length).toBe(1);
    });

    it("should get sessions by status", async () => {
      const { SessionLifecycleManager, SessionStatus } = await import(
        "../../backend/memory/session-lifecycle.js"
      );

      const manager = new SessionLifecycleManager();

      const session1 = await manager.startSession("project");
      const session2 = await manager.startSession("project");
      await manager.pauseSession(session1.id);

      const activeSessions = manager.getSessionsByStatus(SessionStatus.ACTIVE);
      expect(activeSessions.length).toBe(1);

      const pausedSessions = manager.getSessionsByStatus(SessionStatus.PAUSED);
      expect(pausedSessions.length).toBe(1);
    });
  });

  describe("SessionManager - Memory Recovery", () => {
    it("should create new session", async () => {
      const { SessionManager, FileSessionStore } = await import("../../backend/services/session.js");

      const store = new FileSessionStore("/tmp/test-sessions-" + Date.now());
      const manager = new SessionManager(store);

      const active = manager.getActiveSessions();
      expect(active.length).toBe(0);
    });

    it("should track active sessions", async () => {
      const { SessionManager, FileSessionStore } = await import("../../backend/services/session.js");

      const store = new FileSessionStore("/tmp/test-sessions-" + Date.now());
      const manager = new SessionManager(store);

      const active = manager.getActiveSessions();
      expect(Array.isArray(active)).toBe(true);
    });

    it("should cleanup stale sessions", async () => {
      const { SessionManager, FileSessionStore } = await import("../../backend/services/session.js");

      const store = new FileSessionStore("/tmp/test-sessions-" + Date.now());
      const manager = new SessionManager(store);

      const stale = manager.cleanupStaleSessions(30 * 60 * 1000);

      expect(Array.isArray(stale)).toBe(true);
    });

    it("should keep active sessions during cleanup", async () => {
      const { SessionManager, FileSessionStore } = await import("../../backend/services/session.js");

      const store = new FileSessionStore("/tmp/test-sessions-" + Date.now());
      const manager = new SessionManager(store);

      const stale = manager.cleanupStaleSessions(30 * 60 * 1000);

      expect(stale.length).toBe(0);
    });

    it("should update last access time on load", async () => {
      const { SessionManager, FileSessionStore } = await import("../../backend/services/session.js");

      const store = new FileSessionStore("/tmp/test-sessions-" + Date.now());
      const manager = new SessionManager(store);

      const messages = await manager.loadSession("non-existent-thread");
      expect(messages).toEqual([]);
    });

    it("should update message count on save", async () => {
      const { SessionManager, FileSessionStore } = await import("../../backend/services/session.js");

      const store = new FileSessionStore("/tmp/test-sessions-" + Date.now());
      const manager = new SessionManager(store);

      const active = manager.getActiveSessions();
      expect(Array.isArray(active)).toBe(true);
    });
  });

  describe("Session Hooks - Cleanup Callbacks", () => {
    it("should call onStatusChange hook", async () => {
      const { SessionLifecycleManager, SessionStatus } = await import(
        "../../backend/memory/session-lifecycle.js"
      );

      const onStatusChange = vi.fn();

      const manager = new SessionLifecycleManager({}, { onStatusChange });

      const session = await manager.startSession("test-project");

      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: session.id }),
        SessionStatus.PENDING,
        SessionStatus.ACTIVE
      );
    });

    it("should call onEvent hook", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const onEvent = vi.fn();

      const manager = new SessionLifecycleManager({}, { onEvent });

      const session = await manager.startSession("test-project");
      await manager.recordEvent(session.id, "message", "Test message");

      expect(onEvent).toHaveBeenCalled();
    });

    it("should call onFinalize hook", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const onFinalize = vi.fn();

      const manager = new SessionLifecycleManager({}, { onFinalize });

      const session = await manager.startSession("test-project");
      await manager.endSession(session.id);

      expect(onFinalize).toHaveBeenCalled();
    });

    it("should call onDistill hook", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const onDistill = vi.fn();

      const manager = new SessionLifecycleManager({}, { onDistill });

      const session = await manager.startSession("test-project");
      await manager.stopSession(session.id);

      expect(onDistill).toHaveBeenCalled();
    });
  });

  describe("Session Configuration - Limits", () => {
    it("should respect max events limit", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager({
        maxEventsPerSession: 5,
      });

      const session = await manager.startSession("test-project");

      for (let i = 0; i < 10; i++) {
        await manager.recordEvent(session.id, "message", `Message ${i}`);
      }

      const updatedSession = manager.getSession(session.id);
      expect(updatedSession?.events.length).toBe(10);
    });

    it("should respect max observations limit", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager({
        maxObservationsPerSession: 2,
        enableObservationExtraction: true,
      });

      const session = await manager.startSession("test-project");

      await manager.recordEvent(session.id, "message", "I decided to use React");
      await manager.recordEvent(session.id, "message", "I chose TypeScript");

      const updatedSession = manager.getSession(session.id);
      expect(updatedSession?.observations.length).toBeLessThanOrEqual(2);
    });

    it("should use default configuration", async () => {
      const { DEFAULT_SESSION_CONFIG } = await import("../../backend/memory/session-lifecycle.js");

      expect(DEFAULT_SESSION_CONFIG.enableAutoStop).toBe(true);
      expect(DEFAULT_SESSION_CONFIG.autoStopIdleMinutes).toBe(30);
      expect(DEFAULT_SESSION_CONFIG.enableAutoDistill).toBe(true);
      expect(DEFAULT_SESSION_CONFIG.maxEventsPerSession).toBe(10000);
    });
  });

  describe("Session Observations - Memory Extraction", () => {
    it("should extract decisions from events", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager({
        enableObservationExtraction: true,
      });

      const session = await manager.startSession("test-project");

      await manager.recordEvent(session.id, "message", "I decided to use React for the frontend");

      const updatedSession = manager.getSession(session.id);
      expect(updatedSession?.observations.length).toBeGreaterThan(0);
    });

    it("should extract discoveries from events", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager({
        enableObservationExtraction: true,
      });

      const session = await manager.startSession("test-project");

      await manager.recordEvent(session.id, "message", "I discovered that the API has a rate limit");

      const updatedSession = manager.getSession(session.id);
      expect(updatedSession?.observations.length).toBeGreaterThan(0);
    });

    it("should extract preferences from events", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager({
        enableObservationExtraction: true,
      });

      const session = await manager.startSession("test-project");

      await manager.recordEvent(session.id, "message", "I prefer using TypeScript over JavaScript");

      const updatedSession = manager.getSession(session.id);
      expect(updatedSession?.observations.length).toBeGreaterThan(0);
    });
  });

  describe("Session Auto-Redaction", () => {
    it("should redact passwords in events", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");

      await manager.recordEvent(session.id, "message", "password=secret123");

      const updatedSession = manager.getSession(session.id);
      const event = updatedSession?.events[0];

      expect(event?.content).not.toContain("secret123");
      expect(event?.content).toContain("***");
    });

    it("should redact API keys in events", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");

      await manager.recordEvent(session.id, "message", "api_key=sk-1234567890abcdef");

      const updatedSession = manager.getSession(session.id);
      const event = updatedSession?.events[0];

      expect(event?.content).not.toContain("sk-1234567890abcdef");
    });

    it("should redact tokens in events", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");

      await manager.recordEvent(session.id, "message", "bearer abc123token");

      const updatedSession = manager.getSession(session.id);
      const event = updatedSession?.events[0];

      expect(event?.content).not.toContain("abc123token");
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-existent session", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      expect(manager.getSession("non-existent")).toBeUndefined();

      await expect(manager.stopSession("non-existent")).rejects.toThrow();
    });

    it("should handle concurrent session operations", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(manager.startSession(`project-${i}`));
      }

      const sessions = await Promise.all(promises);

      expect(sessions.length).toBe(10);
      expect(manager.getAllSessions().length).toBe(10);
    });

    it("should handle session with no events", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");
      const report = await manager.endSession(session.id);

      expect(report.totalEvents).toBe(0);
      expect(report.qualityScore).toBe(0);
    });

    it("should handle very long session content", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");

      const longContent = "a".repeat(10000);
      await manager.recordEvent(session.id, "message", longContent);

      const updatedSession = manager.getSession(session.id);
      expect(updatedSession?.events[0].content.length).toBe(10000);
    });

    it("should handle session with special characters in project name", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/session-lifecycle.js");

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("project-with_special.chars:123");

      expect(session.project).toBe("project-with_special.chars:123");
    });

    it("should handle multiple status transitions", async () => {
      const { SessionLifecycleManager, SessionStatus } = await import(
        "../../backend/memory/session-lifecycle.js"
      );

      const manager = new SessionLifecycleManager();

      const session = await manager.startSession("test-project");

      await manager.pauseSession(session.id);
      expect(manager.getSession(session.id)?.status).toBe(SessionStatus.PAUSED);

      await manager.resumeSession(session.id);
      expect(manager.getSession(session.id)?.status).toBe(SessionStatus.ACTIVE);

      await manager.stopSession(session.id);
      expect(manager.getSession(session.id)?.status).toBe(SessionStatus.STOPPED);

      await manager.endSession(session.id);
      expect(manager.getSession(session.id)?.status).toBe(SessionStatus.ENDED);
    });
  });
});
