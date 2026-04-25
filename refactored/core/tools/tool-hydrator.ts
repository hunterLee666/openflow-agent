import type { ToolManualEntry } from "./tool-manual-registry.js";

export interface ToolStub {
  name: string;
  description: string;
  isReadOnly?: boolean;
}

export interface ToolHydrationResult {
  name: string;
  manual: ToolManualEntry | null;
  hydratedAt: number;
}

export interface ToolLoader {
  loadTool(name: string): Promise<ToolManualEntry | null>;
}

export class ToolHydrator {
  private inFlight: Map<string, Promise<ToolHydrationResult>> = new Map();
  private hydrated: Map<string, ToolHydrationResult> = new Map();
  private loader: ToolLoader;

  constructor(loader: ToolLoader) {
    this.loader = loader;
  }

  async hydrate(toolName: string): Promise<ToolHydrationResult> {
    const existing = this.hydrated.get(toolName);
    if (existing) {
      return existing;
    }

    const inFlight = this.inFlight.get(toolName);
    if (inFlight) {
      return inFlight;
    }

    const promise = this.doHydrate(toolName);
    this.inFlight.set(toolName, promise);

    try {
      const result = await promise;
      this.hydrated.set(toolName, result);
      return result;
    } finally {
      this.inFlight.delete(toolName);
    }
  }

  async hydrateMany(toolNames: string[]): Promise<Map<string, ToolHydrationResult>> {
    const results = new Map<string, ToolHydrationResult>();
    const promises = toolNames.map((name) => this.hydrate(name));
    const resolved = await Promise.all(promises);

    for (let i = 0; i < toolNames.length; i++) {
      results.set(toolNames[i], resolved[i]);
    }

    return results;
  }

  isHydrated(toolName: string): boolean {
    return this.hydrated.has(toolName);
  }

  isHydrating(toolName: string): boolean {
    return this.inFlight.has(toolName);
  }

  getHydratedCount(): number {
    return this.hydrated.size;
  }

  getInFlightCount(): number {
    return this.inFlight.size;
  }

  clear(): void {
    this.hydrated.clear();
  }

  private async doHydrate(toolName: string): Promise<ToolHydrationResult> {
    const manual = await this.loader.loadTool(toolName);
    return {
      name: toolName,
      manual,
      hydratedAt: Date.now(),
    };
  }
}

export function createToolHydrator(loader: ToolLoader): ToolHydrator {
  return new ToolHydrator(loader);
}
