import { DefaultWorkingMemory } from "./working-memory.js";
import { FileEpisodicMemory } from "./episodic-memory.js";
import { FileSemanticMemory } from "./semantic-memory.js";
import { FileProjectMemory } from "./project-memory.js";
import { MemoryDistiller } from "../kairos/distillation.js";
import type { MemorySystem, MemoryCard } from "./types.js";

export class DefaultMemorySystem implements MemorySystem {
  working = new DefaultWorkingMemory();
  episodic = new FileEpisodicMemory();
  semantic = new FileSemanticMemory();
  project = new FileProjectMemory();

  async inject(
    query: string,
    ctx: { cwd: string; projectScope?: string },
  ): Promise<string> {
    const parts: string[] = [];

    // 1. Project memory (CLAUDE.md hierarchy)
    const projectRules = await this.project.getProjectRules(ctx.cwd);
    if (projectRules.length > 0) {
      parts.push("## Project Rules");
      for (const rule of projectRules) {
        parts.push(`### ${rule.scope}: ${rule.path}`);
        parts.push(rule.content.slice(0, 500));
      }
    }

    // 2. Semantic memory (facts)
    const facts = await this.semantic.query(query, 3);
    if (facts.length > 0) {
      parts.push("## Known Facts");
      for (const fact of facts) {
        parts.push(`- ${fact.subject} ${fact.predicate} ${fact.object} (confidence: ${fact.confidence})`);
      }
    }

    // 3. Working memory context
    if (this.working.currentTask) {
      parts.push(`## Current Task: ${this.working.currentTask}`);
    }
    const notes = Array.from(this.working.contextNotes.entries());
    if (notes.length > 0) {
      parts.push("## Context Notes");
      for (const [k, v] of notes) {
        parts.push(`- ${k}: ${v}`);
      }
    }

    // 4. Recent tool results
    const recentTools = this.working.getRecentToolResults(3);
    if (recentTools.length > 0) {
      parts.push("## Recent Tool Results");
      for (const tr of recentTools) {
        parts.push(`- ${tr.tool}: ${tr.result.slice(0, 200)}`);
      }
    }

    return parts.join("\n\n");
  }

  async distill(sessionId: string): Promise<void> {
    const events = await this.episodic.retrieve(sessionId, 100);

    if (events.length === 0) {
      return;
    }

    const distiller = new MemoryDistiller();

    const input = {
      sessionId,
      rawLogs: events.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        content: e.content,
      })),
    };

    const result = await distiller.distill(this, input);

    if (result.cards.length > 0) {
      await distiller.storeCards(this, result.cards);
    }

    if (result.errors.length > 0) {
      console.warn("Distillation errors:", result.errors);
    }
  }
}

export * from "./types.js";
export { DualModelRetriever, type RetrievalResult, type DualModelRetrievalConfig, type RetrievalCandidate } from "./dual-retrieval.js";
export { ConsolidationManager, createConsolidationManager, DEFAULT_CONSOLIDATION_POLICY } from "./consolidation.js";
export { TokenBudgetInjector, createTokenBudgetInjector, DEFAULT_TOKEN_BUDGET_CONFIG } from "./context-injector.js";
export { MemoryConsolidator, type MemoryHierarchyConfig, type MemorySummary, type HierarchicalMemoryLevel } from "./hierarchy.js";
export { BoundedUUIDSet } from "./bounded-uuid-set.js";
export { SessionLifecycleManager, SessionStatus, createSessionLifecycleManager, DEFAULT_SESSION_CONFIG } from "./session-lifecycle.js";
export { HybridRetriever, createHybridRetriever, DEFAULT_HYBRID_CONFIG } from "./hybrid-retriever.js";
export { PyramidRetriever, createPyramidRetriever, DEFAULT_PYRAMID_CONFIG } from "./pyramid-retriever.js";
export { KnowledgeGraph, createKnowledgeGraph, KnowledgeGraphBuilder } from "./knowledge-graph.js";
