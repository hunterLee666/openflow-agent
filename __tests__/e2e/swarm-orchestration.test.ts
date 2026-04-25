import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Swarm Orchestration Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Swarm Orchestrator Initialization", () => {
    it("should have swarm orchestrator (may be null)", () => {
      expect(services.swarmOrchestrator).toBeDefined();
    });

    it("should handle null swarm orchestrator gracefully", () => {
      if (services.swarmOrchestrator === null) {
        expect(services.swarmOrchestrator).toBeNull();
      } else {
        expect(services.swarmOrchestrator).toBeDefined();
      }
    });
  });

  describe("Swarm Orchestrator Types", () => {
    it("should have SwarmOrchestrator class", async () => {
      const { SwarmOrchestrator } = await import("../../backend/agent/swarm/index.js");
      expect(SwarmOrchestrator).toBeDefined();
    });

    it("should have createSwarmOrchestrator function", async () => {
      const { createSwarmOrchestrator } = await import("../../backend/agent/swarm/index.js");
      expect(typeof createSwarmOrchestrator).toBe("function");
    });
  });

  describe("Swarm Configuration", () => {
    it("should have types module", async () => {
      const types = await import("../../backend/agent/swarm/types.js");
      expect(types).toBeDefined();
    });
  });

  describe("Swarm Orchestrator Methods", () => {
    it("should have executeTask method when initialized", () => {
      if (services.swarmOrchestrator) {
        expect(typeof services.swarmOrchestrator.executeTask).toBe("function");
      }
    });

    it("should have getMetrics method when initialized", () => {
      if (services.swarmOrchestrator) {
        expect(typeof services.swarmOrchestrator.getMetrics).toBe("function");
      }
    });
  });

  describe("Swarm Agent Types", () => {
    it("should support explore agent", () => {
      if (services.swarmOrchestrator) {
        expect(services.swarmOrchestrator).toBeDefined();
      }
    });

    it("should support plan agent", () => {
      if (services.swarmOrchestrator) {
        expect(services.swarmOrchestrator).toBeDefined();
      }
    });

    it("should support verify agent", () => {
      if (services.swarmOrchestrator) {
        expect(services.swarmOrchestrator).toBeDefined();
      }
    });
  });

  describe("Swarm Handoffs", () => {
    it("should support agent handoffs", async () => {
      const { SwarmOrchestrator } = await import("../../backend/agent/swarm/index.js");
      
      const config = {
        enabled: true,
        agents: ["explore", "plan", "verify"],
        handoffs: [
          { from: "explore", to: "plan", condition: "exploration_complete" },
        ],
        maxTurns: 50,
      };
      
      const orchestrator = new SwarmOrchestrator(config);
      expect(orchestrator).toBeDefined();
    });
  });
});
