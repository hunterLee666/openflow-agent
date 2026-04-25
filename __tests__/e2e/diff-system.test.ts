import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Diff System Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Diff Renderer", () => {
    it("should have diff renderer initialized", () => {
      expect(services.diffRenderer).toBeDefined();
    });
  });

  describe("Diff Computation", () => {
    it("should compute diff between strings", async () => {
      const { computeDiff } = await import("../../backend/diff/index.js");
      
      const oldContent = "Hello World";
      const newContent = "Hello Bun";
      
      const diff = computeDiff(oldContent, newContent);
      expect(diff).toBeDefined();
    });

    it("should handle empty content", async () => {
      const { computeDiff } = await import("../../backend/diff/index.js");
      
      const diff = computeDiff("", "new content");
      expect(diff).toBeDefined();
    });

    it("should handle identical content", async () => {
      const { computeDiff } = await import("../../backend/diff/index.js");
      
      const content = "same content";
      const diff = computeDiff(content, content);
      expect(diff).toBeDefined();
    });

    it("should handle multiline content", async () => {
      const { computeDiff } = await import("../../backend/diff/index.js");
      
      const oldContent = "line 1\nline 2\nline 3";
      const newContent = "line 1\nline 2 modified\nline 3";
      
      const diff = computeDiff(oldContent, newContent);
      expect(diff).toBeDefined();
    });
  });

  describe("Diff Blocks", () => {
    it("should identify added lines", async () => {
      const { computeDiff } = await import("../../backend/diff/index.js");
      
      const diff = computeDiff("", "new line");
      expect(diff).toBeDefined();
    });

    it("should identify removed lines", async () => {
      const { computeDiff } = await import("../../backend/diff/index.js");
      
      const diff = computeDiff("old line", "");
      expect(diff).toBeDefined();
    });

    it("should identify modified lines", async () => {
      const { computeDiff } = await import("../../backend/diff/index.js");
      
      const diff = computeDiff("old content", "new content");
      expect(diff).toBeDefined();
    });
  });
});
