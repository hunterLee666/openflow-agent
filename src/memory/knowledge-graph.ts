import type {
  KGEntity,
  KGRelation,
  KGGraph,
  KGQueryOptions,
  KGPathResult,
  KGInferenceResult,
  KGEntityType,
  KGRelationType,
} from "./types.js";

export class KnowledgeGraph implements KGGraph {
  private entities: Map<string, KGEntity> = new Map();
  private relations: Map<string, KGRelation> = new Map();
  private adjacencyList: Map<string, Map<string, KGRelation>> = new Map();
  private reverseAdjacencyList: Map<string, Map<string, KGRelation>> = new Map();
  private entityIndex: Map<KGEntityType, Set<string>> = new Map();
  private relationIndex: Map<KGRelationType, Set<string>> = new Map();

  constructor() {
    this.initIndexes();
  }

  private initIndexes(): void {
    const entityTypes: KGEntityType[] = ["concept", "entity", "event", "document"];
    const relationTypes: KGRelationType[] = [
      "owns",
      "implements",
      "depends_on",
      "implements",
      "uses",
      "part_of",
      "related_to",
      "causes",
      "precedes",
      "succeeds",
      "associates_with",
      "derives_from",
    ];

    for (const type of entityTypes) {
      this.entityIndex.set(type, new Set());
    }

    for (const type of relationTypes) {
      this.relationIndex.set(type, new Set());
    }
  }

  addEntity(entity: KGEntity): void {
    if (this.entities.has(entity.id)) {
      throw new Error(`Entity ${entity.id} already exists`);
    }

    this.entities.set(entity.id, { ...entity });
    this.adjacencyList.set(entity.id, new Map());
    this.reverseAdjacencyList.set(entity.id, new Map());

    const entitySet = this.entityIndex.get(entity.type);
    if (entitySet) {
      entitySet.add(entity.id);
    }
  }

  updateEntity(id: string, updates: Partial<KGEntity>): KGEntity | null {
    const entity = this.entities.get(id);
    if (!entity) return null;

    const updated = { ...entity, ...updates, updatedAt: Date.now() };
    this.entities.set(id, updated);
    return updated;
  }

  removeEntity(id: string): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    this.entities.delete(id);
    this.entityIndex.get(entity.type)?.delete(id);

    const outgoing = this.adjacencyList.get(id);
    if (outgoing) {
      for (const [relId] of outgoing) {
        const relation = this.relations.get(relId);
        if (relation) {
          this.removeRelationFromIndexes(relation);
        }
      }
    }
    this.adjacencyList.delete(id);
    this.reverseAdjacencyList.delete(id);

    const incoming = this.reverseAdjacencyList.get(id);
    if (incoming) {
      for (const [relId] of incoming) {
        const relation = this.relations.get(relId);
        if (relation) {
          this.removeRelationFromIndexes(relation);
        }
      }
    }

    return true;
  }

  getEntity(id: string): KGEntity | undefined {
    return this.entities.get(id);
  }

  getEntitiesByType(type: KGEntityType): KGEntity[] {
    const ids = this.entityIndex.get(type);
    if (!ids) return [];
    return Array.from(ids).map((id) => this.entities.get(id)!).filter(Boolean);
  }

  addRelation(relation: KGRelation): void {
    if (this.relations.has(relation.id)) {
      throw new Error(`Relation ${relation.id} already exists`);
    }

    if (!this.entities.has(relation.sourceId) || !this.entities.has(relation.targetId)) {
      throw new Error("Source or target entity does not exist");
    }

    const rel = { ...relation };
    this.relations.set(rel.id, rel);

    this.adjacencyList.get(rel.sourceId)?.set(rel.targetId, rel);
    this.reverseAdjacencyList.get(rel.targetId)?.set(rel.sourceId, rel);

    const relSet = this.relationIndex.get(rel.type);
    if (relSet) {
      relSet.add(rel.id);
    }
  }

  removeRelation(id: string): boolean {
    const relation = this.relations.get(id);
    if (!relation) return false;

    this.removeRelationFromIndexes(relation);
    this.adjacencyList.get(relation.sourceId)?.delete(relation.targetId);
    this.reverseAdjacencyList.get(relation.targetId)?.delete(relation.sourceId);

    return true;
  }

  private removeRelationFromIndexes(relation: KGRelation): void {
    this.relations.delete(relation.id);
    this.relationIndex.get(relation.type)?.delete(relation.id);
  }

  getRelation(id: string): KGRelation | undefined {
    return this.relations.get(id);
  }

  getRelationsByType(type: KGRelationType): KGRelation[] {
    const ids = this.relationIndex.get(type);
    if (!ids) return [];
    return Array.from(ids).map((id) => this.relations.get(id)!).filter(Boolean);
  }

  getOutgoingRelations(entityId: string): KGRelation[] {
    const outgoing = this.adjacencyList.get(entityId);
    if (!outgoing) return [];
    return Array.from(outgoing.values());
  }

  getIncomingRelations(entityId: string): KGRelation[] {
    const incoming = this.reverseAdjacencyList.get(entityId);
    if (!incoming) return [];
    return Array.from(incoming.values());
  }

  query(startEntityId: string, options?: KGQueryOptions): KGEntity[] {
    const {
      relationTypes,
      maxDepth = 3,
      direction = "outgoing",
      entityTypes,
      predicate,
    } = options || {};

    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: startEntityId, depth: 0 }];
    const results: KGEntity[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const entity = this.entities.get(current.id);
      if (!entity) continue;

      if (current.depth > 0) {
        if (entityTypes && !entityTypes.includes(entity.type)) continue;
        if (predicate && !predicate(entity)) continue;
        results.push(entity);
      }

      if (current.depth >= maxDepth) continue;

      const relations =
        direction === "outgoing"
          ? this.getOutgoingRelations(current.id)
          : direction === "incoming"
          ? this.getIncomingRelations(current.id)
          : [
              ...this.getOutgoingRelations(current.id),
              ...this.getIncomingRelations(current.id),
            ];

      for (const rel of relations) {
        if (relationTypes && !relationTypes.includes(rel.type)) continue;

        const nextId =
          direction === "outgoing"
            ? rel.targetId
            : direction === "incoming"
            ? rel.sourceId
            : rel.targetId === current.id
            ? rel.sourceId
            : rel.targetId;

        if (!visited.has(nextId)) {
          queue.push({ id: nextId, depth: current.depth + 1 });
        }
      }
    }

    return results;
  }

  findPath(
    startId: string,
    endId: string,
    options?: { maxLength?: number; relationTypes?: KGRelationType[] }
  ): KGPathResult | null {
    const maxLength = options?.maxLength || 5;
    const relationTypes = options?.relationTypes;

    if (startId === endId) {
      return {
        path: [startId],
        relations: [],
        totalWeight: 0,
        length: 0,
      };
    }

    const visited = new Set<string>();
    const queue: Array<{
      currentId: string;
      path: string[];
      relations: KGRelation[];
      weight: number;
    }> = [{ currentId: startId, path: [startId], relations: [], weight: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.currentId)) continue;
      visited.add(current.currentId);

      if (current.path.length > maxLength) continue;

      const outgoing = this.getOutgoingRelations(current.currentId);

      for (const rel of outgoing) {
        if (relationTypes && !relationTypes.includes(rel.type)) continue;

        const nextId = rel.targetId;
        const newPath = [...current.path, nextId];
        const newRelations = [...current.relations, rel];
        const newWeight = current.weight + (rel.weight || 1);

        if (nextId === endId) {
          return {
            path: newPath,
            relations: newRelations,
            totalWeight: newWeight,
            length: newPath.length - 1,
          };
        }

        if (!visited.has(nextId) && newPath.length < maxLength) {
          queue.push({
            currentId: nextId,
            path: newPath,
            relations: newRelations,
            weight: newWeight,
          });
        }
      }
    }

    return null;
  }

  findAllPaths(
    startId: string,
    endId: string,
    options?: { maxLength?: number; maxPaths?: number; relationTypes?: KGRelationType[] }
  ): KGPathResult[] {
    const maxLength = options?.maxLength || 5;
    const maxPaths = options?.maxPaths || 10;
    const relationTypes = options?.relationTypes;

    const results: KGPathResult[] = [];

    const dfs = (
      currentId: string,
      path: string[],
      relations: KGRelation[],
      weight: number
    ): void => {
      if (results.length >= maxPaths) return;

      if (currentId === endId && path.length > 1) {
        results.push({
          path: [...path],
          relations: [...relations],
          totalWeight: weight,
          length: path.length - 1,
        });
        return;
      }

      if (path.length > maxLength) return;

      const visited = new Set(path);
      const outgoing = this.getOutgoingRelations(currentId);

      for (const rel of outgoing) {
        if (relationTypes && !relationTypes.includes(rel.type)) continue;

        const nextId = rel.targetId;
        if (visited.has(nextId)) continue;

        dfs(
          nextId,
          [...path, nextId],
          [...relations, rel],
          weight + (rel.weight || 1)
        );
      }
    };

    dfs(startId, [startId], [], 0);

    return results.sort((a, b) => a.totalWeight - b.totalWeight);
  }

  infer(options?: {
    startEntityId?: string;
    relationTypes?: KGRelationType[];
    maxDepth?: number;
  }): KGInferenceResult[] {
    const results: KGInferenceResult[] = [];
    const { startEntityId, relationTypes, maxDepth = 2 } = options || {};

    const entitiesToCheck = startEntityId
      ? [startEntityId]
      : Array.from(this.entities.keys());

    for (const entityId of entitiesToCheck) {
      const visited = new Map<string, number>();

      const traverse = (currentId: string, depth: number): void => {
        if (depth > maxDepth) return;

        const outgoing = this.getOutgoingRelations(currentId);

        for (const rel of outgoing) {
          if (relationTypes && !relationTypes.includes(rel.type)) continue;

          const targetId = rel.targetId;
          const existingDepth = visited.get(targetId);

          if (existingDepth === undefined || depth + 1 < existingDepth) {
            visited.set(targetId, depth + 1);

            const inferredRelation: KGRelation = {
              id: `inferred_${currentId}_${targetId}_${Date.now()}`,
              sourceId: currentId,
              targetId: targetId,
              type: "related_to",
              weight: (rel.weight || 1) * 0.9,
              metadata: {
                inferred: true,
                viaRelation: rel.id,
                viaType: rel.type,
                depth: depth + 1,
              },
            };

            results.push({
              sourceEntityId: currentId,
              targetEntityId: targetId,
              inferredRelation,
              confidence: Math.max(0.1, 1 - (depth + 1) * 0.2),
              reasoning: `Reachable via ${rel.type} relation at depth ${depth + 1}`,
            });

            traverse(targetId, depth + 1);
          }
        }
      };

      traverse(entityId, 0);
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  getNeighbors(
    entityId: string,
    options?: { direction?: "outgoing" | "incoming" | "both"; maxDistance?: number }
  ): Map<string, { entity: KGEntity; viaRelation: KGRelation; distance: number }> {
    const { direction = "both", maxDistance = 1 } = options || {};
    const neighbors = new Map<string, { entity: KGEntity; viaRelation: KGRelation; distance: number }>();

    if (maxDistance === 0) return neighbors;

    if (maxDistance === 1) {
      if (direction === "outgoing" || direction === "both") {
        for (const rel of this.getOutgoingRelations(entityId)) {
          const entity = this.entities.get(rel.targetId);
          if (entity) {
            neighbors.set(entity.id, { entity, viaRelation: rel, distance: 1 });
          }
        }
      }

      if (direction === "incoming" || direction === "both") {
        for (const rel of this.getIncomingRelations(entityId)) {
          const entity = this.entities.get(rel.sourceId);
          if (entity) {
            neighbors.set(entity.id, { entity, viaRelation: rel, distance: 1 });
          }
        }
      }

      return neighbors;
    }

    const visited = new Map<string, number>();
    const queue: Array<{ id: string; distance: number; viaRelation?: KGRelation }> = [
      { id: entityId, distance: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id) && visited.get(current.id)! <= current.distance) {
        continue;
      }
      visited.set(current.id, current.distance);

      if (current.distance >= maxDistance) continue;

      const outgoing = this.getOutgoingRelations(current.id);
      const incoming = this.getIncomingRelations(current.id);

      const processRelation = (rel: KGRelation, direction: "outgoing" | "incoming") => {
        const neighborId = direction === "outgoing" ? rel.targetId : rel.sourceId;

        if (!visited.has(neighborId) || visited.get(neighborId)! > current.distance + 1) {
          const entity = this.entities.get(neighborId);
          if (entity) {
            neighbors.set(neighborId, {
              entity,
              viaRelation: rel,
              distance: current.distance + 1,
            });
            queue.push({ id: neighborId, distance: current.distance + 1, viaRelation: rel });
          }
        }
      };

      if (direction === "outgoing" || direction === "both") {
        for (const rel of outgoing) {
          processRelation(rel, "outgoing");
        }
      }

      if (direction === "incoming" || direction === "both") {
        for (const rel of incoming) {
          processRelation(rel, "incoming");
        }
      }
    }

    return neighbors;
  }

  getStats(): {
    entityCount: number;
    relationCount: number;
    entitiesByType: Record<KGEntityType, number>;
    relationsByType: Record<KGRelationType, number>;
    avgRelationsPerEntity: number;
  } {
    const entitiesByType: Record<KGEntityType, number> = {
      concept: 0,
      entity: 0,
      event: 0,
      document: 0,
    };

    for (const entity of this.entities.values()) {
      entitiesByType[entity.type]++;
    }

    const relationsByType: Record<KGRelationType, number> = {
      owns: 0,
      implements: 0,
      depends_on: 0,
      uses: 0,
      part_of: 0,
      related_to: 0,
      causes: 0,
      precedes: 0,
      succeeds: 0,
      associates_with: 0,
      derives_from: 0,
    };

    for (const relation of this.relations.values()) {
      relationsByType[relation.type]++;
    }

    return {
      entityCount: this.entities.size,
      relationCount: this.relations.size,
      entitiesByType,
      relationsByType,
      avgRelationsPerEntity:
        this.entities.size > 0 ? this.relations.size / this.entities.size : 0,
    };
  }

  clear(): void {
    this.entities.clear();
    this.relations.clear();
    this.adjacencyList.clear();
    this.reverseAdjacencyList.clear();
    this.initIndexes();
  }

  export(): { entities: KGEntity[]; relations: KGRelation[] } {
    return {
      entities: Array.from(this.entities.values()),
      relations: Array.from(this.relations.values()),
    };
  }

  import(data: { entities: KGEntity[]; relations: KGRelation[] }): void {
    this.clear();

    for (const entity of data.entities) {
      this.addEntity(entity);
    }

    for (const relation of data.relations) {
      try {
        this.addRelation(relation);
      } catch {
        // Skip invalid relations during import
      }
    }
  }
}

export function createKnowledgeGraph(): KnowledgeGraph {
  return new KnowledgeGraph();
}

export class KnowledgeGraphBuilder {
  private graph: KnowledgeGraph;
  private entityBuffer: KGEntity[] = [];
  private relationBuffer: KGRelation[] = [];

  constructor() {
    this.graph = new KnowledgeGraph();
  }

  addEntity(entity: KGEntity): this {
    this.entityBuffer.push(entity);
    return this;
  }

  addEntities(entities: KGEntity[]): this {
    this.entityBuffer.push(...entities);
    return this;
  }

  addRelation(relation: KGRelation): this {
    this.relationBuffer.push(relation);
    return this;
  }

  addRelations(relations: KGRelation[]): this {
    this.relationBuffer.push(...relations);
    return this;
  }

  addTriple(
    subjectId: string,
    predicate: KGRelationType,
    objectId: string,
    metadata?: Record<string, unknown>
  ): this {
    const relationId = `rel_${subjectId}_${predicate}_${objectId}_${Date.now()}`;
    this.relationBuffer.push({
      id: relationId,
      sourceId: subjectId,
      targetId: objectId,
      type: predicate,
      weight: 1,
      metadata,
    });
    return this;
  }

  build(): KnowledgeGraph {
    for (const entity of this.entityBuffer) {
      try {
        this.graph.addEntity(entity);
      } catch {
        // Entity already exists
      }
    }

    for (const relation of this.relationBuffer) {
      try {
        this.graph.addRelation(relation);
      } catch {
        // Relation already exists or entities missing
      }
    }

    return this.graph;
  }
}
