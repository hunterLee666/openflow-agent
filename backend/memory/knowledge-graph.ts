import { z } from "zod";

export const EntityTypeSchema = z.enum(["person", "project", "concept", "tool", "location", "event", "organization", "other"]);

export type EntityType = z.infer<typeof EntityTypeSchema>;

export const RelationTypeSchema = z.enum([
  "related_to",
  "depends_on",
  "created_by",
  "part_of",
  "used_by",
  "located_in",
  "belongs_to",
  "causes",
  "prevents",
  "similar_to",
]);

export type RelationType = z.infer<typeof RelationTypeSchema>;

export const GraphEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: EntityTypeSchema,
  description: z.string(),
  properties: z.record(z.string(), z.unknown()),
  createdAt: z.number(),
  updatedAt: z.number(),
  confidence: z.number(),
  mentionCount: z.number(),
});

export type GraphEntity = z.infer<typeof GraphEntitySchema>;

export const GraphRelationSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  type: RelationTypeSchema,
  description: z.string(),
  confidence: z.number(),
  createdAt: z.number(),
  evidence: z.string().optional(),
});

export type GraphRelation = z.infer<typeof GraphRelationSchema>;

export const GraphQuerySchema = z.object({
  entityName: z.string().optional(),
  entityType: EntityTypeSchema.optional(),
  relationType: RelationTypeSchema.optional(),
  connectedTo: z.string().optional(),
  minConfidence: z.number().optional(),
  limit: z.number().optional(),
});

export type GraphQuery = z.infer<typeof GraphQuerySchema>;

export const GraphSearchResultSchema = z.object({
  entities: z.array(GraphEntitySchema),
  relations: z.array(GraphRelationSchema),
  paths: z.array(z.array(GraphEntitySchema)),
});

export type GraphSearchResult = z.infer<typeof GraphSearchResultSchema>;

export const KnowledgeGraphStatsSchema = z.object({
  totalEntities: z.number(),
  totalRelations: z.number(),
  entityTypes: z.record(EntityTypeSchema, z.number()),
  relationTypes: z.record(RelationTypeSchema, z.number()),
});

export type KnowledgeGraphStats = z.infer<typeof KnowledgeGraphStatsSchema>;

export class KnowledgeGraph {
  private entities = new Map<string, GraphEntity>();
  private relations = new Map<string, GraphRelation>();
  private adjacencyList = new Map<string, Set<string>>();
  private reverseAdjacencyList = new Map<string, Set<string>>();

  addEntity(entity: Omit<GraphEntity, "createdAt" | "updatedAt" | "confidence" | "mentionCount">): GraphEntity {
    const now = Date.now();
    const fullEntity: GraphEntity = {
      ...entity,
      createdAt: now,
      updatedAt: now,
      confidence: 1.0,
      mentionCount: 1,
    };

    this.entities.set(fullEntity.id, fullEntity);

    if (!this.adjacencyList.has(fullEntity.id)) {
      this.adjacencyList.set(fullEntity.id, new Set());
    }
    if (!this.reverseAdjacencyList.has(fullEntity.id)) {
      this.reverseAdjacencyList.set(fullEntity.id, new Set());
    }

    return fullEntity;
  }

  updateEntity(id: string, updates: Partial<Pick<GraphEntity, "name" | "description" | "properties">>): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    Object.assign(entity, updates, { updatedAt: Date.now() });
    return true;
  }

  incrementMentionCount(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    entity.mentionCount++;
    entity.updatedAt = Date.now();
    return true;
  }

  addRelation(relation: Omit<GraphRelation, "id" | "createdAt" | "confidence">): GraphRelation {
    const id = `${relation.sourceId}->${relation.targetId}:${relation.type}`;

    const fullRelation: GraphRelation = {
      ...relation,
      id,
      createdAt: Date.now(),
      confidence: 1.0,
    };

    this.relations.set(id, fullRelation);

    if (!this.adjacencyList.has(relation.sourceId)) {
      this.adjacencyList.set(relation.sourceId, new Set());
    }
    this.adjacencyList.get(relation.sourceId)!.add(relation.targetId);

    if (!this.reverseAdjacencyList.has(relation.targetId)) {
      this.reverseAdjacencyList.set(relation.targetId, new Set());
    }
    this.reverseAdjacencyList.get(relation.targetId)!.add(relation.sourceId);

    return fullRelation;
  }

  updateRelationConfidence(id: string, confidence: number): boolean {
    const relation = this.relations.get(id);
    if (!relation) return false;

    relation.confidence = Math.max(0, Math.min(1, confidence));
    return true;
  }

  getEntity(id: string): GraphEntity | undefined {
    return this.entities.get(id);
  }

  getRelation(id: string): GraphRelation | undefined {
    return this.relations.get(id);
  }

  query(query: GraphQuery): GraphSearchResult {
    let matchedEntities = Array.from(this.entities.values());

    if (query.entityName) {
      const nameLower = query.entityName.toLowerCase();
      matchedEntities = matchedEntities.filter(
        (e) => e.name.toLowerCase().includes(nameLower) || e.description.toLowerCase().includes(nameLower)
      );
    }

    if (query.entityType) {
      matchedEntities = matchedEntities.filter((e) => e.type === query.entityType);
    }

    if (query.minConfidence !== undefined) {
      const minConf = query.minConfidence;
      matchedEntities = matchedEntities.filter((e) => e.confidence >= minConf);
    }

    let matchedRelations = Array.from(this.relations.values());

    if (query.relationType) {
      matchedRelations = matchedRelations.filter((r) => r.type === query.relationType);
    }

    if (query.connectedTo) {
      const connectedIds = new Set<string>();
      const forward = this.adjacencyList.get(query.connectedTo);
      const reverse = this.reverseAdjacencyList.get(query.connectedTo);

      if (forward) {
        for (const id of forward) connectedIds.add(id);
      }
      if (reverse) {
        for (const id of reverse) connectedIds.add(id);
      }

      matchedEntities = matchedEntities.filter((e) => connectedIds.has(e.id) || e.id === query.connectedTo);
      matchedRelations = matchedRelations.filter(
        (r) => r.sourceId === query.connectedTo || r.targetId === query.connectedTo
      );
    }

    const limit = query.limit ?? 50;
    matchedEntities = matchedEntities.slice(0, limit);

    const paths = this.findPaths(matchedEntities.map((e) => e.id), 3);

    return {
      entities: matchedEntities,
      relations: matchedRelations,
      paths,
    };
  }

  findPaths(startIds: string[], maxDepth = 3): GraphEntity[][] {
    const paths: GraphEntity[][] = [];

    for (const startId of startIds) {
      const visited = new Set<string>();
      const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }];

      while (queue.length > 0) {
        const { id, path } = queue.shift()!;

        if (path.length > maxDepth) continue;

        const neighbors = this.adjacencyList.get(id);
        if (!neighbors) continue;

        for (const neighborId of neighbors) {
          if (visited.has(neighborId)) continue;

          const newPath = [...path, neighborId];
          paths.push(newPath.map((pid) => this.entities.get(pid)!).filter(Boolean));

          visited.add(neighborId);
          queue.push({ id: neighborId, path: newPath });
        }
      }
    }

    return paths.slice(0, 20);
  }

  getConnectedEntities(id: string, depth = 1): GraphEntity[] {
    const visited = new Set<string>();
    const queue: Array<{ id: string; currentDepth: number }> = [{ id, currentDepth: 0 }];
    const result: GraphEntity[] = [];

    while (queue.length > 0) {
      const { id: currentId, currentDepth } = queue.shift()!;

      if (currentDepth > depth) continue;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const entity = this.entities.get(currentId);
      if (entity && currentId !== id) {
        result.push(entity);
      }

      const neighbors = this.adjacencyList.get(currentId);
      if (neighbors) {
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            queue.push({ id: neighborId, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    return result;
  }

  applyTimeDecay(decayRate = 0.01, currentTime?: number): void {
    const now = currentTime ?? Date.now();

    for (const entity of this.entities.values()) {
      const ageInDays = (now - entity.updatedAt) / (1000 * 60 * 60 * 24);
      const decayFactor = Math.exp(-decayRate * ageInDays);
      entity.confidence *= decayFactor;
    }

    for (const relation of this.relations.values()) {
      const ageInDays = (now - relation.createdAt) / (1000 * 60 * 60 * 24);
      const decayFactor = Math.exp(-decayRate * ageInDays);
      relation.confidence *= decayFactor;
    }
  }

  pruneLowConfidence(threshold = 0.1): { prunedEntities: number; prunedRelations: number } {
    let prunedEntities = 0;
    let prunedRelations = 0;

    const entitiesToRemove: string[] = [];
    for (const [id, entity] of this.entities.entries()) {
      if (entity.confidence < threshold) {
        entitiesToRemove.push(id);
      }
    }

    for (const id of entitiesToRemove) {
      this.entities.delete(id);
      this.adjacencyList.delete(id);
      this.reverseAdjacencyList.delete(id);
      prunedEntities++;
    }

    const relationsToRemove: string[] = [];
    for (const [id, relation] of this.relations.entries()) {
      if (relation.confidence < threshold || !this.entities.has(relation.sourceId) || !this.entities.has(relation.targetId)) {
        relationsToRemove.push(id);
      }
    }

    for (const id of relationsToRemove) {
      this.relations.delete(id);
      prunedRelations++;
    }

    return { prunedEntities, prunedRelations };
  }

  getStats(): KnowledgeGraphStats {
    const entityTypes: Record<EntityType, number> = {
      person: 0,
      project: 0,
      concept: 0,
      tool: 0,
      location: 0,
      event: 0,
      organization: 0,
      other: 0,
    };

    const relationTypes: Record<RelationType, number> = {
      related_to: 0,
      depends_on: 0,
      created_by: 0,
      part_of: 0,
      used_by: 0,
      located_in: 0,
      belongs_to: 0,
      causes: 0,
      prevents: 0,
      similar_to: 0,
    };

    for (const entity of this.entities.values()) {
      entityTypes[entity.type]++;
    }

    for (const relation of this.relations.values()) {
      relationTypes[relation.type]++;
    }

    return {
      totalEntities: this.entities.size,
      totalRelations: this.relations.size,
      entityTypes,
      relationTypes,
    };
  }

  clear(): void {
    this.entities.clear();
    this.relations.clear();
    this.adjacencyList.clear();
    this.reverseAdjacencyList.clear();
  }
}

export function createKnowledgeGraph(): KnowledgeGraph {
  return new KnowledgeGraph();
}
