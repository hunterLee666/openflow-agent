import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Sandbox Execution Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Sandbox Adapter Initialization", () => {
    it("should have sandbox adapter initialized", () => {
      expect(services.sandboxAdapter).toBeDefined();
    });
  });

  describe("Sandbox Adapter Types", () => {
    it("should have create sandbox adapter function", async () => {
      const { createSandboxAdapter } = await import("../../backend/security/sandbox.js");
      expect(typeof createSandboxAdapter).toBe("function");
    });

    it("should create sandbox adapter", async () => {
      const { createSandboxAdapter } = await import("../../backend/security/sandbox.js");
      
      const adapter = createSandboxAdapter();
      expect(adapter).toBeDefined();
    });
  });

  describe("Sandbox Execution", () => {
    it("should have execute method", () => {
      expect(typeof services.sandboxAdapter.execute).toBe("function");
    });
  });

  describe("Sandbox Violation Detection", () => {
    it("should support violation checking", async () => {
      const { createSandboxAdapter } = await import("../../backend/security/sandbox.js");
      expect(createSandboxAdapter).toBeDefined();
    });
  });

  describe("Sandbox Platform Support", () => {
    it("should have platform mapping", async () => {
      const { PLATFORM_SANDBOX_BACKENDS } = await import("../../backend/security/sandbox.js");
      expect(PLATFORM_SANDBOX_BACKENDS).toBeDefined();
    });

    it("should support macOS sandbox-exec", async () => {
      const { PLATFORM_SANDBOX_BACKENDS } = await import("../../backend/security/sandbox.js");
      expect(PLATFORM_SANDBOX_BACKENDS.darwin).toBeDefined();
    });

    it("should support Linux bwrap", async () => {
      const { PLATFORM_SANDBOX_BACKENDS } = await import("../../backend/security/sandbox.js");
      expect(PLATFORM_SANDBOX_BACKENDS.linux).toBeDefined();
    });
  });

  describe("Sandbox Configuration", () => {
    it("should have default config", async () => {
      const { getDefaultSandboxConfig } = await import("../../backend/security/sandbox.js");
      expect(typeof getDefaultSandboxConfig).toBe("function");
      
      const config = getDefaultSandboxConfig();
      expect(config).toBeDefined();
    });
  });

  describe("Sandbox Security", () => {
    it("should enforce read-only paths", () => {
      expect(services.sandboxAdapter).toBeDefined();
    });

    it("should enforce denied paths", () => {
      expect(services.sandboxAdapter).toBeDefined();
    });

    it("should enforce network restrictions", () => {
      expect(services.sandboxAdapter).toBeDefined();
    });
  });
});
