import { describe, it, expect, beforeAll } from "vitest";
import { initializeSystemServices, type SystemServices } from "./test-helpers.js";

describe("E2E: Knowledge Graph Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Knowledge Graph Types", () => {
    it("should have KnowledgeGraph class", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      expect(KnowledgeGraph).toBeDefined();
    });

    it("should have KGEntity interface", async () => {
      const types = await import("../../backend/memory/types.js");
      expect(types.KGEntity).toBeDefined();
    });

    it("should have KGRelation interface", async () => {
      const types = await import("../../backend/memory/types.js");
      expect(types.KGRelation).toBeDefined();
    });
  });

  describe("Knowledge Graph Methods", () => {
    it("should have addEntity method", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      expect(typeof kg.addEntity).toBe("function");
    });

    it("should have updateEntity method", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      expect(typeof kg.updateEntity).toBe("function");
    });

    it("should have removeEntity method", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      expect(typeof kg.removeEntity).toBe("function");
    });

    it("should have addRelation method", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      expect(typeof kg.addRelation).toBe("function");
    });

    it("should have removeRelation method", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      expect(typeof kg.removeRelation).toBe("function");
    });
  });

  describe("Entity Operations", () => {
    it("should add entity successfully", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      const entity = {
        id: "entity-1",
        type: "concept" as const,
        name: "Test Entity",
        description: "A test entity",
        properties: [{ key: "description", value: "A test entity", type: "string" as const }],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: ["test"],
      };
      expect(() => kg.addEntity(entity)).not.toThrow();
    });

    it("should throw on duplicate entity", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      const entity = {
        id: "entity-2",
        type: "concept" as const,
        name: "Test Entity",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };
      kg.addEntity(entity);
      expect(() => kg.addEntity(entity)).toThrow();
    });

    it("should update entity successfully", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      const entity = {
        id: "entity-3",
        type: "concept" as const,
        name: "Original Name",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };
      kg.addEntity(entity);
      const updated = kg.updateEntity("entity-3", { name: "Updated Name" });
      expect(updated?.name).toBe("Updated Name");
    });

    it("should return null for non-existent entity update", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      const result = kg.updateEntity("non-existent", { name: "Test" });
      expect(result).toBeNull();
    });

    it("should remove entity successfully", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      const entity = {
        id: "entity-4",
        type: "concept" as const,
        name: "To Remove",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };
      kg.addEntity(entity);
      const removed = kg.removeEntity("entity-4");
      expect(removed).toBe(true);
    });

    it("should return false for non-existent entity removal", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      const removed = kg.removeEntity("non-existent");
      expect(removed).toBe(false);
    });
  });

  describe("Relation Operations", () => {
    it("should add relation successfully", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      kg.addEntity({
        id: "source-entity",
        type: "concept" as const,
        name: "Source",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      });
      kg.addEntity({
        id: "target-entity",
        type: "concept" as const,
        name: "Target",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      });
      const relation = {
        id: "relation-1",
        type: "depends_on" as const,
        sourceId: "source-entity",
        targetId: "target-entity",
        weight: 1.0,
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
      };
      expect(() => kg.addRelation(relation)).not.toThrow();
    });

    it("should remove relation successfully", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      kg.addEntity({
        id: "source-entity-2",
        type: "concept" as const,
        name: "Source",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      });
      kg.addEntity({
        id: "target-entity-2",
        type: "concept" as const,
        name: "Target",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      });
      const relation = {
        id: "relation-2",
        type: "depends_on" as const,
        sourceId: "source-entity-2",
        targetId: "target-entity-2",
        weight: 1.0,
        properties: [],
        createdAt: Date.now(),
      };
      kg.addRelation(relation);
      const removed = kg.removeRelation("relation-2");
      expect(removed).toBe(true);
    });
  });

  describe("Entity Types", () => {
    it("should support concept entity type", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      const entity = {
        id: "concept-1",
        type: "concept" as const,
        name: "Concept Entity",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };
      kg.addEntity(entity);
      expect(kg).toBeDefined();
    });

    it("should support entity entity type", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      const entity = {
        id: "entity-type-1",
        type: "entity" as const,
        name: "Entity Type",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };
      kg.addEntity(entity);
      expect(kg).toBeDefined();
    });

    it("should support event entity type", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      const entity = {
        id: "event-1",
        type: "event" as const,
        name: "Event Entity",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };
      kg.addEntity(entity);
      expect(kg).toBeDefined();
    });

    it("should support document entity type", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      const entity = {
        id: "document-1",
        type: "document" as const,
        name: "Document Entity",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };
      kg.addEntity(entity);
      expect(kg).toBeDefined();
    });
  });

  describe("Relation Types", () => {
    it("should support depends_on relation type", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      kg.addEntity({
        id: "dep-source",
        type: "concept" as const,
        name: "Source",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      });
      kg.addEntity({
        id: "dep-target",
        type: "concept" as const,
        name: "Target",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      });
      const relation = {
        id: "dep-relation",
        type: "depends_on" as const,
        sourceId: "dep-source",
        targetId: "dep-target",
        weight: 1.0,
        properties: [],
        createdAt: Date.now(),
      };
      kg.addRelation(relation);
      expect(kg).toBeDefined();
    });

    it("should support implements relation type", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      kg.addEntity({
        id: "impl-source",
        type: "concept" as const,
        name: "Source",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      });
      kg.addEntity({
        id: "impl-target",
        type: "concept" as const,
        name: "Target",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      });
      const relation = {
        id: "impl-relation",
        type: "implements" as const,
        sourceId: "impl-source",
        targetId: "impl-target",
        weight: 1.0,
        properties: [],
        createdAt: Date.now(),
      };
      kg.addRelation(relation);
      expect(kg).toBeDefined();
    });

    it("should support uses relation type", async () => {
      const { KnowledgeGraph } = await import("../../backend/memory/knowledge-graph.js");
      const kg = new KnowledgeGraph();
      kg.addEntity({
        id: "uses-source",
        type: "concept" as const,
        name: "Source",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      });
      kg.addEntity({
        id: "uses-target",
        type: "concept" as const,
        name: "Target",
        properties: [],
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      });
      const relation = {
        id: "uses-relation",
        type: "uses" as const,
        sourceId: "uses-source",
        targetId: "uses-target",
        weight: 1.0,
        properties: [],
        createdAt: Date.now(),
      };
      kg.addRelation(relation);
      expect(kg).toBeDefined();
    });
  });
});
