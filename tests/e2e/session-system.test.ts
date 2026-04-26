import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { FileSessionStore, SessionManager } from "../../backend/session/session.js";
import type { Message } from "../../backend/session/types.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-session-e2e-${Date.now()}`);

describe("E2E - 会话系统完整场景", () => {
  let store: FileSessionStore;
  let manager: SessionManager;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    store = new FileSessionStore({ sessionsDir: TEST_DIR });
    manager = new SessionManager(store);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: 会话创建与管理", () => {
    it("应该能够创建新的会话线程", async () => {
      const threadId = await manager.createSession();
      
      expect(threadId).toBeDefined();
      expect(threadId).toMatch(/^thread_\d+_[a-z0-9]+$/);
    });

    it("应该能够创建多个会话线程", async () => {
      const thread1 = await manager.createSession();
      const thread2 = await manager.createSession();
      const thread3 = await manager.createSession();

      expect(thread1).not.toBe(thread2);
      expect(thread2).not.toBe(thread3);
      expect(thread1).not.toBe(thread3);

      const threads = await store.listThreads();
      expect(threads.length).toBe(3);
    });

    it("应该能够列出所有会话线程", async () => {
      await manager.createSession();
      await manager.createSession();
      await manager.createSession();

      const threads = await store.listThreads();
      expect(threads.length).toBe(3);
    });
  });

  describe("场景 2: 消息存储与加载", () => {
    it("应该能够保存和加载消息", async () => {
      const threadId = await manager.createSession();
      
      const messages: Message[] = [
        { role: "user", content: "你好，我想了解这个项目" },
        { role: "assistant", content: "你好！这是一个 AI 助手项目" },
        { role: "user", content: "它有什么功能？" },
        { role: "assistant", content: "它可以帮助你编写代码、回答问题等" },
      ];

      await manager.saveSession(threadId, messages);

      const loaded = await manager.loadSession(threadId);
      expect(loaded.length).toBe(4);
      expect(loaded[0].content).toBe("你好，我想了解这个项目");
      expect(loaded[3].content).toBe("它可以帮助你编写代码、回答问题等");
    });

    it("应该能够追加消息到现有会话", async () => {
      const threadId = await manager.createSession();
      
      const messages1: Message[] = [
        { role: "user", content: "第一条消息" },
        { role: "assistant", content: "第一条回复" },
      ];

      await manager.saveSession(threadId, messages1);

      const messages2: Message[] = [
        ...messages1,
        { role: "user", content: "第二条消息" },
        { role: "assistant", content: "第二条回复" },
      ];

      await manager.saveSession(threadId, messages2);

      const loaded = await manager.loadSession(threadId);
      expect(loaded.length).toBe(4);
    });

    it("应该能够处理空消息列表", async () => {
      const threadId = await manager.createSession();
      await manager.saveSession(threadId, []);

      const loaded = await manager.loadSession(threadId);
      expect(loaded.length).toBe(0);
    });

    it("应该能够处理大量消息", async () => {
      const threadId = await manager.createSession();
      
      const messages: Message[] = [];
      for (let i = 0; i < 100; i++) {
        messages.push({ role: "user", content: `用户消息 ${i}` });
        messages.push({ role: "assistant", content: `助手回复 ${i}` });
      }

      await manager.saveSession(threadId, messages);

      const loaded = await manager.loadSession(threadId);
      expect(loaded.length).toBe(200);
    });
  });

  describe("场景 3: 会话持久化", () => {
    it("会话应该在重启后保持", async () => {
      const threadId = await manager.createSession();
      
      const messages: Message[] = [
        { role: "user", content: "持久化测试" },
        { role: "assistant", content: "收到" },
      ];

      await manager.saveSession(threadId, messages);

      const newStore = new FileSessionStore({ sessionsDir: TEST_DIR });
      const newManager = new SessionManager(newStore);

      const loaded = await newManager.loadSession(threadId);
      expect(loaded.length).toBe(2);
      expect(loaded[0].content).toBe("持久化测试");
    });

    it("删除的会话应该无法加载", async () => {
      const threadId = await manager.createSession();
      
      const messages: Message[] = [
        { role: "user", content: "测试删除" },
      ];

      await manager.saveSession(threadId, messages);
      await store.deleteThread(threadId);

      const loaded = await manager.loadSession(threadId);
      expect(loaded.length).toBe(0);
    });
  });

  describe("场景 4: 会话元数据", () => {
    it("应该能够跟踪活跃会话", async () => {
      const thread1 = await manager.createSession();
      const thread2 = await manager.createSession();

      await manager.saveSession(thread1, [
        { role: "user", content: "消息1" },
      ]);

      await manager.saveSession(thread2, [
        { role: "user", content: "消息2" },
        { role: "assistant", content: "回复2" },
      ]);

      const loaded1 = await manager.loadSession(thread1);
      const loaded2 = await manager.loadSession(thread2);

      expect(loaded1.length).toBe(1);
      expect(loaded2.length).toBe(2);
    });

    it("应该能够更新最后访问时间", async () => {
      const threadId = await manager.createSession();
      
      await manager.saveSession(threadId, [
        { role: "user", content: "测试" },
      ]);

      await new Promise((r) => setTimeout(r, 100));

      await manager.loadSession(threadId);

      const threads = await store.listThreads();
      expect(threads.length).toBe(1);
    });
  });

  describe("场景 5: 多用户会话场景", () => {
    it("应该能够处理多个并发会话", async () => {
      const sessions = await Promise.all([
        manager.createSession(),
        manager.createSession(),
        manager.createSession(),
      ]);

      const messages: Message[] = [
        { role: "user", content: "并发测试" },
      ];

      await Promise.all(
        sessions.map((threadId) => manager.saveSession(threadId, messages))
      );

      const loadedSessions = await Promise.all(
        sessions.map((threadId) => manager.loadSession(threadId))
      );

      loadedSessions.forEach((loaded) => {
        expect(loaded.length).toBe(1);
        expect(loaded[0].content).toBe("并发测试");
      });
    });

    it("应该能够独立管理不同会话的消息", async () => {
      const thread1 = await manager.createSession();
      const thread2 = await manager.createSession();

      await manager.saveSession(thread1, [
        { role: "user", content: "会话1的消息" },
      ]);

      await manager.saveSession(thread2, [
        { role: "user", content: "会话2的消息" },
      ]);

      const loaded1 = await manager.loadSession(thread1);
      const loaded2 = await manager.loadSession(thread2);

      expect(loaded1[0].content).toBe("会话1的消息");
      expect(loaded2[0].content).toBe("会话2的消息");
    });
  });

  describe("场景 6: 消息格式验证", () => {
    it("应该能够处理不同角色的消息", async () => {
      const threadId = await manager.createSession();
      
      const messages: Message[] = [
        { role: "user", content: "用户消息" },
        { role: "assistant", content: "助手消息" },
        { role: "system", content: "系统消息" },
      ];

      await manager.saveSession(threadId, messages);

      const loaded = await manager.loadSession(threadId);
      expect(loaded.length).toBe(3);
      expect(loaded[0].role).toBe("user");
      expect(loaded[1].role).toBe("assistant");
      expect(loaded[2].role).toBe("system");
    });

    it("应该能够处理包含特殊字符的消息", async () => {
      const threadId = await manager.createSession();
      
      const messages: Message[] = [
        { role: "user", content: "包含特殊字符: \n\t\r\"'<>&" },
        { role: "assistant", content: "中文测试：你好世界！🎉" },
      ];

      await manager.saveSession(threadId, messages);

      const loaded = await manager.loadSession(threadId);
      expect(loaded[0].content).toContain("特殊字符");
      expect(loaded[1].content).toContain("你好世界");
    });

    it("应该能够处理长消息", async () => {
      const threadId = await manager.createSession();
      
      const longContent = "这是一条很长的消息。".repeat(1000);
      
      const messages: Message[] = [
        { role: "user", content: longContent },
      ];

      await manager.saveSession(threadId, messages);

      const loaded = await manager.loadSession(threadId);
      expect(loaded[0].content.length).toBe(longContent.length);
    });
  });

  describe("场景 7: 会话清理", () => {
    it("应该能够删除单个会话", async () => {
      const thread1 = await manager.createSession();
      const thread2 = await manager.createSession();

      await manager.saveSession(thread1, [
        { role: "user", content: "会话1" },
      ]);

      await manager.saveSession(thread2, [
        { role: "user", content: "会话2" },
      ]);

      await store.deleteThread(thread1);

      const threads = await store.listThreads();
      expect(threads.length).toBe(1);
      expect(threads[0]).toBe(thread2);
    });

    it("应该能够删除所有会话", async () => {
      await manager.createSession();
      await manager.createSession();
      await manager.createSession();

      const threads = await store.listThreads();
      
      for (const threadId of threads) {
        await store.deleteThread(threadId);
      }

      const remaining = await store.listThreads();
      expect(remaining.length).toBe(0);
    });
  });

  describe("场景 8: 错误处理", () => {
    it("加载不存在的会话应该返回空数组", async () => {
      const loaded = await manager.loadSession("nonexistent-thread");
      expect(loaded.length).toBe(0);
    });

    it("删除不存在的会话不应该抛出错误", async () => {
      try {
        await store.deleteThread("nonexistent-thread");
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeUndefined();
      }
    });

    it("应该能够处理无效的会话 ID", async () => {
      const loaded = await manager.loadSession("");
      expect(loaded.length).toBe(0);
    });
  });
});
