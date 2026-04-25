import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: ACP Agent Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("ACP Agent Initialization", () => {
    it("should have ACP agent initialized", () => {
      expect(services.acpAgent).toBeDefined();
    });

    it("should be DefaultAcpAgent instance", () => {
      expect(services.acpAgent.constructor.name).toBe("DefaultAcpAgent");
    });
  });

  describe("ACP Agent Factory", () => {
    it("should have create ACP agent function", async () => {
      const { createAcpAgent } = await import("../../backend/services/acp/index.js");
      expect(typeof createAcpAgent).toBe("function");
    });

    it("should create ACP agent with config", async () => {
      const { createAcpAgent } = await import("../../backend/services/acp/index.js");
      
      const agent = createAcpAgent({});
      expect(agent).toBeDefined();
    });
  });

  describe("ACP Agent Methods", () => {
    it("should have initialize method", () => {
      expect(typeof services.acpAgent.initialize).toBe("function");
    });

    it("should have authenticate method", () => {
      expect(typeof services.acpAgent.authenticate).toBe("function");
    });

    it("should have newSession method", () => {
      expect(typeof services.acpAgent.newSession).toBe("function");
    });

    it("should have prompt method", () => {
      expect(typeof services.acpAgent.prompt).toBe("function");
    });
  });

  describe("ACP Agent Protocol", () => {
    it("should support initialize request", async () => {
      const response = await services.acpAgent.initialize({
        version: "1.0.0",
        clientCapabilities: {
          streaming: true,
          notifications: true,
        },
      });
      
      expect(response).toBeDefined();
      expect(response.version).toBeDefined();
    });
  });
});
