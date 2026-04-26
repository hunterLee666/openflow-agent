import { readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ToolManualEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  usage: z.string(),
  examples: z.array(z.string()),
  safetyNotes: z.array(z.string()).optional(),
  concurrencyInfo: z.object({
    isSafe: z.boolean(),
    resourceKeys: z.array(z.string()).optional(),
  }).optional(),
});

export type ToolManualEntry = z.infer<typeof ToolManualEntrySchema>;

export interface ToolManualIndex {
  tools: Map<string, ToolManualEntry>;
  categories: Map<string, string[]>;
  lastUpdated: number;
}

export class ToolManualRegistry {
  private index: ToolManualIndex = {
    tools: new Map(),
    categories: new Map(),
    lastUpdated: 0,
  };

  private manualPaths: Map<string, string> = new Map();
  private cache: Map<string, ToolManualEntry> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;

  async initialize(toolsDir?: string): Promise<void> {
    const dir = toolsDir || join(__dirname, "tools");
    await this.scanDirectory(dir);
    this.index.lastUpdated = Date.now();
  }

  private async scanDirectory(dir: string): Promise<void> {
    try {
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath);
        } else if (entry.name.endsWith(".prompt.ts") || entry.name.endsWith(".manual.json")) {
          await this.registerManualFile(fullPath);
        }
      }
    } catch {
      // Directory may not exist, skip
    }
  }

  private async registerManualFile(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, "utf-8");

      let entry: ToolManualEntry | null = null;

      if (filePath.endsWith(".manual.json")) {
        entry = JSON.parse(content) as ToolManualEntry;
      } else if (filePath.endsWith(".prompt.ts")) {
        entry = await this.parsePromptTsFile(filePath, content);
      }

      if (entry) {
        this.index.tools.set(entry.name, entry);
        this.manualPaths.set(entry.name, filePath);

        const category = this.extractCategory(filePath);
        if (category) {
          const existing = this.index.categories.get(category) || [];
          if (!existing.includes(entry.name)) {
            existing.push(entry.name);
            this.index.categories.set(category, existing);
          }
        }
      }
    } catch {
      // Skip invalid files
    }
  }

  private async parsePromptTsFile(filePath: string, content: string): Promise<ToolManualEntry | null> {
    const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
    const descMatch = content.match(/description:\s*["']([^"']+)["']/);

    if (!nameMatch) return null;

    return {
      name: nameMatch[1],
      description: descMatch?.[1] || "No description available",
      usage: this.extractUsage(content),
      examples: this.extractExamples(content),
      safetyNotes: this.extractSafetyNotes(content),
    };
  }

  private extractUsage(content: string): string {
    const usageMatch = content.match(/usage:\s*["']([^"']+)["']/);
    return usageMatch?.[1] || "See tool documentation";
  }

  private extractExamples(content: string): string[] {
    const examples: string[] = [];
    const exampleRegex = /example:\s*["']([^"']+)["']/g;
    let match;

    while ((match = exampleRegex.exec(content)) !== null) {
      examples.push(match[1]);
    }

    return examples.slice(0, 3);
  }

  private extractSafetyNotes(content: string): string[] {
    const notes: string[] = [];
    const safetyRegex = /safety:\s*["']([^"']+)["']/g;
    let match;

    while ((match = safetyRegex.exec(content)) !== null) {
      notes.push(match[1]);
    }

    return notes;
  }

  private extractCategory(filePath: string): string | null {
    const toolsDirMatch = filePath.match(/[/\\]tools[/\\]([^/\\]+)[/\\]/);
    return toolsDirMatch?.[1]?.replace(/-tools$/, "") || null;
  }

  async search(query: string, options?: { category?: string; limit?: number }): Promise<ToolManualEntry[]> {
    const results: ToolManualEntry[] = [];
    const limit = options?.limit || 10;
    const queryLower = query.toLowerCase();

    for (const [name, entry] of this.index.tools) {
      if (options?.category) {
        const categoryTools = this.index.categories.get(options.category);
        if (!categoryTools?.includes(name)) continue;
      }

      const matches = name.toLowerCase().includes(queryLower) ||
        entry.description.toLowerCase().includes(queryLower);

      if (matches) {
        results.push(entry);
      }

      if (results.length >= limit) break;
    }

    return results;
  }

  async getManual(toolName: string): Promise<ToolManualEntry | null> {
    const cached = this.cache.get(toolName);
    if (cached) {
      this.cacheHits++;
      return cached;
    }

    this.cacheMisses++;

    const entry = this.index.tools.get(toolName);
    if (!entry) return null;

    const fullPath = this.manualPaths.get(toolName);
    if (fullPath) {
      try {
        const fileStat = await stat(fullPath);
        if (fileStat.mtimeMs > this.index.lastUpdated) {
          await this.registerManualFile(fullPath);
          const refreshed = this.index.tools.get(toolName);
          if (refreshed) {
            this.cache.set(toolName, refreshed);
            return refreshed;
          }
        }
      } catch {
        // File may have been deleted, use cached version
      }
    }

    this.cache.set(toolName, entry);
    return entry;
  }

  async getManualsByCategory(category: string): Promise<ToolManualEntry[]> {
    const toolNames = this.index.categories.get(category) || [];
    const manuals: ToolManualEntry[] = [];

    for (const name of toolNames) {
      const manual = await this.getManual(name);
      if (manual) manuals.push(manual);
    }

    return manuals;
  }

  getAllCategories(): string[] {
    return Array.from(this.index.categories.keys());
  }

  getAllToolNames(): string[] {
    return Array.from(this.index.tools.keys());
  }

  getCacheStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  getIndexStats(): { toolCount: number; categoryCount: number; lastUpdated: number } {
    return {
      toolCount: this.index.tools.size,
      categoryCount: this.index.categories.size,
      lastUpdated: this.index.lastUpdated,
    };
  }
}

export const toolManualRegistry = new ToolManualRegistry();
