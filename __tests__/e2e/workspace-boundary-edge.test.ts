import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Workspace Boundary Edge Cases Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Workspace Validator Initialization", () => {
    it("should have workspace validator initialized", () => {
      expect(services.workspaceValidator).toBeDefined();
    });
  });

  describe("Workspace Boundary Validator Types", () => {
    it("should have WorkspaceBoundaryValidator class", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      expect(WorkspaceBoundaryValidator).toBeDefined();
    });
  });

  describe("Workspace Boundary Validator Methods", () => {
    it("should have validateRead method", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({ boundaries: { root: "/tmp" } });
      expect(typeof validator.validateRead).toBe("function");
    });

    it("should have validateWrite method", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({ boundaries: { root: "/tmp" } });
      expect(typeof validator.validateWrite).toBe("function");
    });

    it("should have validateExecute method", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({ boundaries: { root: "/tmp" } });
      expect(typeof validator.validateExecute).toBe("function");
    });
  });

  describe("Path Validation Edge Cases", () => {
    it("should reject paths outside workspace", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: {
          root: "/workspace",
          deniedPaths: ["/etc/passwd", "/.ssh/"],
        },
      });
      const result = validator.validateRead("/etc/passwd");
      expect(result.valid).toBe(false);
    });

    it("should accept paths inside workspace", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: {
          root: "/tmp",
          allowedPaths: ["/tmp/test"],
        },
      });
      const result = validator.validateRead("/tmp/test/file.txt");
      expect(result).toBeDefined();
    });

    it("should handle symlink traversal attempts", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: {
          root: "/workspace",
          deniedPaths: ["/workspace/../etc"],
        },
      });
      const result = validator.validateRead("/workspace/../etc/passwd");
      expect(result.valid).toBe(false);
    });

    it("should handle null bytes in path", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: { root: "/workspace" },
      });
      const result = validator.validateRead("/workspace/file\u0000.txt");
      expect(result.valid).toBe(false);
    });

    it("should handle very long paths", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: { root: "/workspace" },
      });
      const longPath = "/workspace/" + "a".repeat(1000);
      const result = validator.validateRead(longPath);
      expect(result).toBeDefined();
    });
  });

  describe("Denied Paths Edge Cases", () => {
    it("should deny access to .git directory", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: {
          root: "/workspace",
          deniedPaths: ["/.git/"],
        },
      });
      const result = validator.validateRead("/workspace/.git/config");
      expect(result.valid).toBe(false);
    });

    it("should deny access to .ssh directory", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: {
          root: "/workspace",
          deniedPaths: ["/.ssh/"],
        },
      });
      const result = validator.validateRead("/workspace/.ssh/id_rsa");
      expect(result.valid).toBe(false);
    });

    it("should deny access to .aws directory", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: {
          root: "/workspace",
          deniedPaths: ["/.aws/"],
        },
      });
      const result = validator.validateRead("/workspace/.aws/credentials");
      expect(result.valid).toBe(false);
    });
  });

  describe("Write Validation Edge Cases", () => {
    it("should validate write operations", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: { root: "/tmp" },
        checkOnWrite: true,
      });
      const result = validator.validateWrite("/tmp/test.txt");
      expect(result).toBeDefined();
    });

    it("should reject writes to denied paths", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: {
          root: "/workspace",
          deniedPaths: ["/workspace/protected/"],
        },
        checkOnWrite: true,
      });
      const result = validator.validateWrite("/workspace/protected/secret.txt");
      expect(result.valid).toBe(false);
    });
  });

  describe("Execute Validation Edge Cases", () => {
    it("should validate execute operations", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: { root: "/tmp" },
        checkOnExecute: true,
      });
      const result = validator.validateExecute("/tmp/script.sh");
      expect(result).toBeDefined();
    });

    it("should reject execution from denied paths", async () => {
      const { WorkspaceBoundaryValidator } = await import("../../backend/security/workspace-boundary.js");
      const validator = new WorkspaceBoundaryValidator({
        boundaries: {
          root: "/workspace",
          deniedPaths: ["/workspace/bin/"],
        },
        checkOnExecute: true,
      });
      const result = validator.validateExecute("/workspace/bin/malicious");
      expect(result.valid).toBe(false);
    });
  });
});
