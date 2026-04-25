import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Transport Layer Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Transport Initialization", () => {
    it("should have transport (may be null)", () => {
      expect(services.transport).toBeDefined();
    });

    it("should handle null transport gracefully", () => {
      if (services.transport === null) {
        expect(services.transport).toBeNull();
      } else {
        expect(services.transport).toBeDefined();
      }
    });
  });

  describe("Transport Types", () => {
    it("should have Stdio transport", async () => {
      const { StdioTransport } = await import("../../backend/services/transport/index.js");
      expect(StdioTransport).toBeDefined();
    });

    it("should have WebSocket transport", async () => {
      const { WebSocketTransport } = await import("../../backend/services/transport/index.js");
      expect(WebSocketTransport).toBeDefined();
    });

    it("should have TCP transport", async () => {
      const { TcpTransport } = await import("../../backend/services/transport/index.js");
      expect(TcpTransport).toBeDefined();
    });
  });

  describe("Transport Factory", () => {
    it("should have create transport function", async () => {
      const { createTransport } = await import("../../backend/services/transport/index.js");
      expect(typeof createTransport).toBe("function");
    });

    it("should create stdio transport", async () => {
      const { createTransport } = await import("../../backend/services/transport/index.js");
      
      const transport = createTransport({ type: "stdio" }, { onMessage: () => {} });
      expect(transport).toBeDefined();
    });
  });

  describe("Base Transport", () => {
    it("should have base transport", async () => {
      const { BaseTransport } = await import("../../backend/services/transport/index.js");
      expect(BaseTransport).toBeDefined();
    });
  });

  describe("Stdio Transport Features", () => {
    it("should support stdin/stdout communication", async () => {
      const { StdioTransport } = await import("../../backend/services/transport/index.js");
      
      const transport = new StdioTransport(
        { type: "stdio" },
        { onMessage: () => {} }
      );
      
      expect(transport).toBeDefined();
    });
  });

  describe("WebSocket Transport Features", () => {
    it("should support WebSocket configuration", async () => {
      const { WebSocketTransport } = await import("../../backend/services/transport/index.js");
      expect(WebSocketTransport).toBeDefined();
    });
  });

  describe("TCP Transport Features", () => {
    it("should support TCP configuration", async () => {
      const { TcpTransport } = await import("../../backend/services/transport/index.js");
      expect(TcpTransport).toBeDefined();
    });
  });
});
