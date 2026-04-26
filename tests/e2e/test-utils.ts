import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export interface TestEnvironment {
  tempDir: string;
  testId: string;
  memoryDir: string;
  sessionsDir: string;
  workspaceDir: string;
}

export function createTestEnvironment(): TestEnvironment {
  const testId = `e2e-test-${randomUUID().slice(0, 8)}`;
  const tempDir = join(tmpdir(), testId);
  
  return {
    testId,
    tempDir,
    memoryDir: join(tempDir, "memory"),
    sessionsDir: join(tempDir, "sessions"),
    workspaceDir: join(tempDir, "workspace"),
  };
}

export async function setupTestEnvironment(env: TestEnvironment): Promise<void> {
  await mkdir(env.tempDir, { recursive: true });
  await mkdir(env.memoryDir, { recursive: true });
  await mkdir(env.sessionsDir, { recursive: true });
  await mkdir(env.workspaceDir, { recursive: true });
}

export async function teardownTestEnvironment(env: TestEnvironment): Promise<void> {
  await rm(env.tempDir, { recursive: true, force: true });
}

export async function createTestFile(
  env: TestEnvironment,
  relativePath: string,
  content: string
): Promise<string> {
  const fullPath = join(env.workspaceDir, relativePath);
  const dirPath = join(fullPath, "..");
  await mkdir(dirPath, { recursive: true });
  await writeFile(fullPath, content, "utf-8");
  return fullPath;
}

export async function readTestFile(
  env: TestEnvironment,
  relativePath: string
): Promise<string> {
  const fullPath = join(env.workspaceDir, relativePath);
  return readFile(fullPath, "utf-8");
}

export class MockLLM {
  responses: Map<string, string> = new Map();
  calls: Array<{ prompt: string; options: any }> = [];

  setResponse(prompt: string, response: string) {
    this.responses.set(prompt, response);
  }

  setDefaultResponse(response: string) {
    this.responses.set("__default__", response);
  }

  async generate(prompt: string, options: any = {}): Promise<string> {
    this.calls.push({ prompt, options });
    return this.responses.get(prompt) || this.responses.get("__default__") || "Mock response";
  }

  getCallCount(): number {
    return this.calls.length;
  }

  getLastCall(): { prompt: string; options: any } | undefined {
    return this.calls[this.calls.length - 1];
  }

  reset() {
    this.responses.clear();
    this.calls = [];
  }
}

export class MockFileSystem {
  files: Map<string, string> = new Map();

  writeFile(path: string, content: string) {
    this.files.set(path, content);
  }

  readFile(path: string): string | undefined {
    return this.files.get(path);
  }

  exists(path: string): boolean {
    return this.files.has(path);
  }

  deleteFile(path: string) {
    this.files.delete(path);
  }

  listFiles(): string[] {
    return Array.from(this.files.keys());
  }

  reset() {
    this.files.clear();
  }
}

export async function waitForCondition(
  condition: () => Promise<boolean> | boolean,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

export async function measureTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const startTime = Date.now();
  const result = await fn();
  const durationMs = Date.now() - startTime;
  return { result, durationMs };
}

export function createTestScenario(name: string, description: string) {
  return {
    name,
    description,
    steps: [] as Array<{
      action: string;
      expected: string;
      validate?: () => Promise<boolean> | boolean;
    }>,
    addStep(action: string, expected: string, validate?: () => Promise<boolean> | boolean) {
      this.steps.push({ action, expected, validate });
      return this;
    },
  };
}

export function generateRandomString(length: number = 10): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateLargeContent(sizeKb: number = 100): string {
  const baseText = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ";
  const repeats = Math.ceil((sizeKb * 1024) / baseText.length);
  return baseText.repeat(repeats);
}
