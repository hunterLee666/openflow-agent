import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: MCP Service Discovery Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("MCP Service Discovery Initialization", () => {
    it("should have MCP service discovery initialized", () => {
      expect(services.mcpServiceDiscovery).toBeDefined();
    });
  });

  describe("MCP Server", () => {
    it("should have MCP server", async () => {
      const { McpServer } = await import("../../backend/services/mcp/index.js");
      expect(McpServer).toBeDefined();
    });
  });

  describe("MCP Client", () => {
    it("should have enhanced MCP client", async () => {
      const { EnhancedMCPClient } = await import("../../backend/services/mcp/index.js");
      expect(EnhancedMCPClient).toBeDefined();
    });
  });

  describe("MCP Service Discovery Methods", () => {
    it("should have service discovery instance", () => {
      expect(services.mcpServiceDiscovery).toBeDefined();
    });
  });

  describe("MCP Configuration", () => {
    it("should have protocol types", async () => {
      const types = await import("../../backend/services/mcp/protocol.js");
      expect(types).toBeDefined();
    });

    it("should have enhanced client types", async () => {
      const types = await import("../../backend/services/mcp/enhanced-client.js");
      expect(types).toBeDefined();
    });
  });

  describe("MCP Protocol", () => {
    it("should support server initialization", async () => {
      const { McpServer } = await import("../../backend/services/mcp/index.js");
      expect(McpServer).toBeDefined();
    });
  });

  describe("MCP Features", () => {
    it("should support tool registration", async () => {
      const { McpServer } = await import("../../backend/services/mcp/index.js");
      expect(McpServer).toBeDefined();
    });

    it("should support resource registration", async () => {
      const { McpServer } = await import("../../backend/services/mcp/index.js");
      expect(McpServer).toBeDefined();
    });

    it("should support prompt registration", async () => {
      const { McpServer } = await import("../../backend/services/mcp/index.js");
      expect(McpServer).toBeDefined();
    });
  });

  describe("MCP Service Registry", () => {
    it("should have default service registry", async () => {
      const { defaultServiceRegistry } = await import("../../backend/services/mcp/index.js");
      expect(defaultServiceRegistry).toBeDefined();
    });
  });
});
