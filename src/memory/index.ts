import { DefaultWorkingMemory } from "./working-memory.js";
import { FileEpisodicMemory } from "./episodic-memory.js";
import { FileSemanticMemory } from "./semantic-memory.js";
import { FileProjectMemory } from "./project-memory.js";
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
    // Extract semantic facts from episodic events
    const events = await this.episodic.retrieve(sessionId, 50);

    // Simple heuristic: user preferences and project facts
    for (const event of events) {
      if (event.type === "user_message") {
        // Extract preferences (simplified)
        const preferenceMatch = event.content.match(/(?:prefer|use|always|never)\s+(\w+)/i);
        if (preferenceMatch) {
          await this.semantic.store({
            id: `pref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            subject: "user",
            predicate: "prefers",
            object: preferenceMatch[1],
            confidence: 0.7,
            source: sessionId,
            createdAt: new Date(),
            tags: ["preference"],
          });
        }
      }
    }

    await this.semantic.consolidate();
  }
}

export * from "./types.js";
export type * from "./bounded-uuid-set.js";
export type * from "./consolidation.js";
export type * from "./context-injector.js";
export * from "./hybrid-retriever.js";
export * from "./pyramid-retriever.js";
export type * from "./session-lifecycle.js";
export * from "./knowledge-graph.js";
