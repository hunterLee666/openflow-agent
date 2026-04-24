import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  SemanticMemory,
  SemanticFact,
  KGEntity,
  KGRelation,
  KGEntityType,
  KGRelationType,
  KGGraph,
  KGQueryOptions,
  KGPathResult,
  KGInferenceResult,
} from "./types.js";
import { KnowledgeGraph, createKnowledgeGraph, KnowledgeGraphBuilder } from "./knowledge-graph.js";
import { APP_SEMANTIC_DIR } from "../utils/paths.js";

export class FileSemanticMemory implements SemanticMemory {
  private baseDir: string;
  private facts: SemanticFact[] = [];
  private dirty = false;
  private kg: KnowledgeGraph;
  private kgDirty = false;
  private entityMapping: Map<string, string> = new Map();
  private factToEntityMapping: Map<string, string> = new Map();

  constructor(baseDir?: string) {
    this.baseDir = baseDir || APP_SEMANTIC_DIR;
    this.kg = createKnowledgeGraph();
    this.load();
    this.loadKG();
  }

  private get factsPath(): string {
    return join(this.baseDir, "facts.json");
  }

  private get kgPath(): string {
    return join(this.baseDir, "knowledge-graph.json");
  }

  private async load(): Promise<void> {
    if (!existsSync(this.factsPath)) return;
    try {
      const data = await readFile(this.factsPath, "utf-8");
      const parsed = JSON.parse(data) as SemanticFact[];
      this.facts = parsed.map((f) => ({
        ...f,
        createdAt: new Date(f.createdAt),
      }));
    } catch {
      this.facts = [];
    }
  }

  private async loadKG(): Promise<void> {
    if (!existsSync(this.kgPath)) return;
    try {
      const data = await readFile(this.kgPath, "utf-8");
      const parsed = JSON.parse(data);
      this.kg.import(parsed);
    } catch {
      this.kg = createKnowledgeGraph();
    }
  }

  private async save(): Promise<void> {
    if (!this.dirty) return;
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.factsPath, JSON.stringify(this.facts, null, 2));
    this.dirty = false;
  }

  private async saveKG(): Promise<void> {
    if (!this.kgDirty) return;
    await mkdir(this.baseDir, { recursive: true });
    const data = this.kg.export();
    await writeFile(this.kgPath, JSON.stringify(data, null, 2));
    this.kgDirty = false;
  }

  async store(fact: SemanticFact): Promise<void> {
    const existing = this.facts.find(
      (f) => f.subject === fact.subject && f.predicate === fact.predicate && f.object === fact.object
    );
    if (existing) {
      existing.confidence = Math.max(existing.confidence, fact.confidence);
      existing.updatedAt = new Date();
      this.dirty = true;
    } else {
      this.facts.push(fact);
      this.dirty = true;
    }

    await this.addFactToGraph(fact);
    await this.save();
  }

  private async addFactToGraph(fact: SemanticFact): Promise<void> {
    let sourceEntityId = this.entityMapping.get(fact.subject);
    let targetEntityId = this.entityMapping.get(fact.object);

    if (!sourceEntityId) {
      sourceEntityId = `entity_${fact.subject}_${Date.now()}`;
      const sourceEntity: KGEntity = {
        id: sourceEntityId,
        type: "entity",
        name: fact.subject,
        properties: [],
        confidence: fact.confidence,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: fact.source,
        tags: fact.tags || [],
      };
      this.kg.addEntity(sourceEntity);
      this.entityMapping.set(fact.subject, sourceEntityId);
      this.kgDirty = true;
    }

    if (!targetEntityId) {
      targetEntityId = `entity_${fact.object}_${Date.now()}`;
      const targetEntity: KGEntity = {
        id: targetEntityId,
        type: "entity",
        name: fact.object,
        properties: [],
        confidence: fact.confidence,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: fact.source,
        tags: fact.tags || [],
      };
      this.kg.addEntity(targetEntity);
      this.entityMapping.set(fact.object, targetEntityId);
      this.kgDirty = true;
    }

    const relationId = `rel_${sourceEntityId}_${fact.predicate}_${targetEntityId}`;
    const relationType = this.mapPredicateToRelationType(fact.predicate);
    const relation: KGRelation = {
      id: relationId,
      sourceId: sourceEntityId,
      targetId: targetEntityId,
      type: relationType,
      weight: fact.confidence,
      confidence: fact.confidence,
      createdAt: Date.now(),
      metadata: { originalPredicate: fact.predicate },
    };

    try {
      this.kg.addRelation(relation);
      this.factToEntityMapping.set(`${fact.subject}|${fact.predicate}|${fact.object}`, relationId);
      this.kgDirty = true;
    } catch {
      // Relation already exists
    }

    await this.saveKG();
  }

  private mapPredicateToRelationType(predicate: string): KGRelationType {
    const mapping: Record<string, KGRelationType> = {
      is_a: "part_of",
      part_of: "part_of",
      has: "owns",
      owns: "owns",
      uses: "uses",
      used_by: "uses",
      depends_on: "depends_on",
      related_to: "related_to",
      implements: "implements",
      implements_: "implements",
      causes: "causes",
      precedes: "precedes",
      succeeds: "succeeds",
    };

    return mapping[predicate.toLowerCase()] || "related_to";
  }

  async query(question: string, limit = 5): Promise<SemanticFact[]> {
    const keywords = question.toLowerCase().split(/\s+/);
    const scored = this.facts.map((fact) => {
      const text = `${fact.subject} ${fact.predicate} ${fact.object} ${fact.tags?.join(" ") || ""}`.toLowerCase();
      const score = keywords.reduce((sum, kw) => sum + (text.includes(kw) ? 1 : 0), 0);
      return { fact, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.fact);
  }

  async consolidate(): Promise<void> {
    const threshold = 0.5;
    this.facts = this.facts.filter((f) => f.confidence >= threshold);

    const seen = new Set<string>();
    this.facts = this.facts.filter((f) => {
      const key = `${f.subject}|${f.predicate}|${f.object}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    this.dirty = true;
    await this.save();
  }

  getKnowledgeGraph(): KGGraph {
    return this.kg;
  }

  queryGraph(
    startEntityId: string,
    options?: KGQueryOptions
  ): KGEntity[] {
    return this.kg.query(startEntityId, options);
  }

  findPaths(
    startId: string,
    endId: string,
    options?: { maxLength?: number; maxPaths?: number; relationTypes?: KGRelationType[] }
  ): KGPathResult[] {
    return this.kg.findAllPaths(startId, endId, options);
  }

  findShortestPath(
    startId: string,
    endId: string,
    options?: { maxLength?: number; relationTypes?: KGRelationType[] }
  ): KGPathResult | null {
    return this.kg.findPath(startId, endId, options);
  }

  inferRelations(options?: {
    startEntityId?: string;
    relationTypes?: KGRelationType[];
    maxDepth?: number;
  }): KGInferenceResult[] {
    return this.kg.infer(options);
  }

  getEntityNeighbors(
    entityId: string,
    options?: { direction?: "outgoing" | "incoming" | "both"; maxDistance?: number }
  ): Map<string, { entity: KGEntity; viaRelation: KGRelation; distance: number }> {
    return this.kg.getNeighbors(entityId, options);
  }

  getOrCreateEntity(
    name: string,
    type: KGEntityType = "entity",
    metadata?: Partial<KGEntity>
  ): KGEntity {
    const existing = Array.from(this.kg.export().entities).find(
      (e) => e.name === name && e.type === type
    );

    if (existing) return existing;

    const entity: KGEntity = {
      id: `entity_${name}_${Date.now()}`,
      type,
      name,
      properties: [],
      confidence: metadata?.confidence ?? 0.8,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: metadata?.source,
      tags: metadata?.tags || [],
      metadata: metadata?.metadata,
    };

    this.kg.addEntity(entity);
    this.entityMapping.set(name, entity.id);
    this.kgDirty = true;
    this.saveKG();

    return entity;
  }

  addRelationBetweenEntities(
    sourceName: string,
    relationType: KGRelationType,
    targetName: string,
    weight = 1.0
  ): KGRelation | null {
    const sourceEntity = this.getOrCreateEntity(sourceName);
    const targetEntity = this.getOrCreateEntity(targetName);

    const relation: KGRelation = {
      id: `rel_${sourceEntity.id}_${relationType}_${targetEntity.id}_${Date.now()}`,
      sourceId: sourceEntity.id,
      targetId: targetEntity.id,
      type: relationType,
      weight,
      confidence: weight,
      createdAt: Date.now(),
    };

    try {
      this.kg.addRelation(relation);
      this.kgDirty = true;
      this.saveKG();
      return relation;
    } catch {
      return null;
    }
  }

  getGraphStats(): ReturnType<KGGraph["getStats"]> {
    return this.kg.getStats();
  }

  async rebuildGraphFromFacts(): Promise<void> {
    this.kg.clear();
    this.entityMapping.clear();
    this.factToEntityMapping.clear();

    for (const fact of this.facts) {
      await this.addFactToGraph(fact);
    }

    this.kgDirty = true;
    await this.saveKG();
  }
}

export function createSemanticMemoryWithKG(baseDir?: string): FileSemanticMemory {
  return new FileSemanticMemory(baseDir);
}

export function createKGFromFacts(facts: SemanticFact[]): KnowledgeGraphBuilder {
  const builder = new KnowledgeGraphBuilder();
  const entityMap = new Map<string, KGEntity>();

  for (const fact of facts) {
    let sourceEntity = entityMap.get(fact.subject);
    if (!sourceEntity) {
      sourceEntity = {
        id: `entity_${fact.subject}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "entity",
        name: fact.subject,
        properties: [],
        confidence: fact.confidence,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: fact.source,
        tags: fact.tags || [],
      };
      entityMap.set(fact.subject, sourceEntity);
      builder.addEntity(sourceEntity);
    }

    let targetEntity = entityMap.get(fact.object);
    if (!targetEntity) {
      targetEntity = {
        id: `entity_${fact.object}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "entity",
        name: fact.object,
        properties: [],
        confidence: fact.confidence,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: fact.source,
        tags: fact.tags || [],
      };
      entityMap.set(fact.object, targetEntity);
      builder.addEntity(targetEntity);
    }

    const relationType = mapPredicateToRelationType(fact.predicate);
    builder.addTriple(sourceEntity.id, relationType, targetEntity.id, {
      originalPredicate: fact.predicate,
      confidence: fact.confidence,
    });
  }

  return builder;
}

function mapPredicateToRelationType(predicate: string): KGRelationType {
  const mapping: Record<string, KGRelationType> = {
    is_a: "part_of",
    part_of: "part_of",
    has: "owns",
    owns: "owns",
    uses: "uses",
    used_by: "uses",
    depends_on: "depends_on",
    related_to: "related_to",
    implements: "implements",
    implements_: "implements",
    causes: "causes",
    precedes: "precedes",
    succeeds: "succeeds",
  };

  return mapping[predicate.toLowerCase()] || "related_to";
}
