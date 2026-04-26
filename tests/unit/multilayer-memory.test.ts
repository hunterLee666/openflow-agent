import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EnhancedMemoryCore, createEnhancedMemoryCore } from "../../backend/memory/enhanced-memory-core.js";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

describe("Multi-layer Markdown Memory System", () => {
  let memory: EnhancedMemoryCore;
  const testDir = ".openflow/test-multilayer-memory";

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });

    memory = createEnhancedMemoryCore({
      memoryDir: testDir,
      enableVectorSearch: true,
      vectorBackend: "hnsw",
      enableKnowledgeGraph: true,
      enableConfidenceScoring: true,
      enableConsolidationScheduler: false,
    });

    await memory.initialize();
  });

  afterEach(async () => {
    await memory.shutdown();
    await rm(testDir, { recursive: true, force: true });
  });

  describe("MEMORY.md", () => {
    it("should load MEMORY.md on initialization", async () => {
      const content = "# Environment Facts\n- Node.js v20\n- Project uses TypeScript\n";
      await writeFile(join(testDir, "MEMORY.md"), content);

      await memory.shutdown();
      memory = createEnhancedMemoryCore({
        memoryDir: testDir,
        enableVectorSearch: false,
        enableKnowledgeGraph: false,
        enableConfidenceScoring: false,
        enableConsolidationScheduler: false,
      });
      await memory.initialize();

      const results = await memory.searchMemory("Node.js", 5);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("USER.md", () => {
    it("should load USER.md on initialization", async () => {
      const content = "# User Preferences\n- Prefers dark mode\n- Uses vim\n";
      await writeFile(join(testDir, "USER.md"), content);

      await memory.shutdown();
      memory = createEnhancedMemoryCore({
        memoryDir: testDir,
        enableVectorSearch: false,
        enableKnowledgeGraph: false,
        enableConfidenceScoring: false,
        enableConsolidationScheduler: false,
      });
      await memory.initialize();

      const results = await memory.searchMemory("vim", 5);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("daily/*.md", () => {
    it("should load daily logs on initialization", async () => {
      const dailyDir = join(testDir, "daily");
      await mkdir(dailyDir, { recursive: true });

      await writeFile(
        join(dailyDir, "2026-04-25.md"),
        "# Daily Log: 2026-04-25\n\n## 10:00\n\nDeployed auth service to staging\n"
      );
      await writeFile(
        join(dailyDir, "2026-04-24.md"),
        "# Daily Log: 2026-04-24\n\n## 09:00\n\nFixed login bug\n"
      );

      await memory.shutdown();
      memory = createEnhancedMemoryCore({
        memoryDir: testDir,
        enableVectorSearch: false,
        enableKnowledgeGraph: false,
        enableConfidenceScoring: false,
        enableConsolidationScheduler: false,
      });
      await memory.initialize();

      const results = await memory.searchMemory("auth service", 5);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should write daily log entries", async () => {
      await memory.writeDailyLog("Completed memory system refactoring");

      const today = new Date().toISOString().split("T")[0];
      const path = join(testDir, "daily", `${today}.md`);
      expect(existsSync(path)).toBe(true);

      const content = await readFile(path, "utf-8");
      expect(content).toContain("Completed memory system refactoring");
    });
  });

  describe("projects/*.md", () => {
    it("should load project memories on initialization", async () => {
      const projectsDir = join(testDir, "projects");
      await mkdir(projectsDir, { recursive: true });

      await writeFile(
        join(projectsDir, "auth-service.md"),
        "# Project: Auth Service\n\nREST API with JWT authentication.\nUses PostgreSQL.\n"
      );
      await writeFile(
        join(projectsDir, "frontend-app.md"),
        "# Project: Frontend App\n\nReact + TypeScript SPA.\nUses Vite.\n"
      );

      await memory.shutdown();
      memory = createEnhancedMemoryCore({
        memoryDir: testDir,
        enableVectorSearch: false,
        enableKnowledgeGraph: true,
        enableConfidenceScoring: false,
        enableConsolidationScheduler: false,
      });
      await memory.initialize();

      const results = await memory.searchMemory("JWT", 5);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should write project memory", async () => {
      await memory.writeProjectMemory("auth-service", "Added OAuth2 support");

      const path = join(testDir, "projects", "auth-service.md");
      expect(existsSync(path)).toBe(true);

      const content = await readFile(path, "utf-8");
      expect(content).toContain("Added OAuth2 support");
    });
  });

  describe("entities/*.md", () => {
    it("should load entity profiles on initialization", async () => {
      const entitiesDir = join(testDir, "entities");
      await mkdir(entitiesDir, { recursive: true });

      await writeFile(
        join(entitiesDir, "redis.md"),
        "# Tool: Redis\n\nIn-memory data store used for caching.\nVersion: 7.2\n"
      );

      await memory.shutdown();
      memory = createEnhancedMemoryCore({
        memoryDir: testDir,
        enableVectorSearch: false,
        enableKnowledgeGraph: true,
        enableConfidenceScoring: false,
        enableConsolidationScheduler: false,
      });
      await memory.initialize();

      const results = await memory.searchMemory("Redis", 5);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should write entity profile", async () => {
      await memory.writeEntityProfile("PostgreSQL", "Primary database for auth service. Version 16.");

      const path = join(testDir, "entities", "postgresql.md");
      expect(existsSync(path)).toBe(true);

      const content = await readFile(path, "utf-8");
      expect(content).toContain("Primary database");
    });

    it("should write entity profile with explicit type", async () => {
      await memory.writeEntityProfile("Alice", "Project manager for auth service.", "person");

      const path = join(testDir, "entities", "alice.md");
      expect(existsSync(path)).toBe(true);

      const content = await readFile(path, "utf-8");
      expect(content).toContain("Person: Alice");
    });
  });

  describe("sessions/*.md", () => {
    it("should load session archives on initialization", async () => {
      const sessionsDir = join(testDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      await writeFile(
        join(sessionsDir, "session-20260425.md"),
        "# Session: 2026-04-25\n\nUser asked about memory system architecture.\nDiscussed HNSW vs sqlite-vec.\n"
      );

      await memory.shutdown();
      memory = createEnhancedMemoryCore({
        memoryDir: testDir,
        enableVectorSearch: false,
        enableKnowledgeGraph: false,
        enableConfidenceScoring: false,
        enableConsolidationScheduler: false,
      });
      await memory.initialize();

      const results = await memory.searchMemory("HNSW", 5);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should write session archive", async () => {
      await memory.writeSessionArchive("session-test-001", "# Session Test\n\nDiscussed project requirements.\n");

      const path = join(testDir, "sessions", "session-test-001.md");
      expect(existsSync(path)).toBe(true);

      const content = await readFile(path, "utf-8");
      expect(content).toContain("Discussed project requirements");
    });
  });

  describe("knowledge graph integration", () => {
    it("should create entities from project memories", async () => {
      await memory.writeProjectMemory("test-project", "A test project for verification");

      const stats = memory.getStats();
      expect(stats.knowledgeGraph).toBeDefined();
    });

    it("should create entities from entity profiles", async () => {
      await memory.writeEntityProfile("TestTool", "A test tool for verification", "tool");

      const stats = memory.getStats();
      expect(stats.knowledgeGraph).toBeDefined();
    });
  });
});
