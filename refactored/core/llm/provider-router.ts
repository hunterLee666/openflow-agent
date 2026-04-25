import { EventEmitter } from "node:events";
import type { ProviderConfig, ProviderHealth, FailoverEvent } from "./types.js";

export class ProviderRouter extends EventEmitter {
  private providers: Map<string, ProviderConfig> = new Map();
  private health: Map<string, ProviderHealth> = new Map();
  private currentProvider: string | null = null;
  private failoverHistory: FailoverEvent[] = [];
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(providers: ProviderConfig[]) {
    super();
    for (const provider of providers) {
      this.providers.set(provider.name, provider);
      this.health.set(provider.name, {
        name: provider.name,
        status: "healthy",
        lastCheck: Date.now(),
        errorCount: 0,
        successCount: 0,
        latency: 0,
      });
      this.circuitBreakers.set(provider.name, new CircuitBreaker());
    }

    if (providers.length > 0) {
      const sorted = [...providers].sort((a, b) => {
        const aPriority = a.priority || 1;
        const bPriority = b.priority || 1;
        return aPriority - bPriority;
      });
      this.currentProvider = sorted[0].name;
    }
  }

  selectFromCandidates(candidateNames: string[]): { provider: string; config: ProviderConfig } | null {
    const candidates = candidateNames
      .map((name) => ({
        name,
        config: this.providers.get(name),
        health: this.health.get(name),
        circuitBreaker: this.circuitBreakers.get(name),
      }))
      .filter((c) => c.config !== undefined);

    for (const candidate of candidates) {
      if (candidate.circuitBreaker?.isOpen()) {
        continue;
      }

      if (candidate.health?.status === "unhealthy") {
        continue;
      }

      if (candidate.config) {
        return { provider: candidate.name, config: candidate.config };
      }
    }

    if (candidates.length > 0 && candidates[0].config) {
      return { provider: candidates[0].name, config: candidates[0].config };
    }

    return null;
  }

  async routeRequest<T>(
    candidateNames: string[],
    executor: (provider: ProviderConfig) => Promise<T>,
    options?: { maxRetries?: number; timeout?: number }
  ): Promise<{ result: T; provider: string }> {
    const maxRetries = options?.maxRetries || 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const selected = this.selectFromCandidates(candidateNames);

      if (!selected) {
        throw new Error("No healthy providers available");
      }

      try {
        const startTime = Date.now();
        const result = await this.executeWithTimeout(
          () => executor(selected.config),
          options?.timeout || selected.config.timeout || 30000
        );

        const latency = Date.now() - startTime;
        this.recordSuccess(selected.provider, latency);

        if (this.currentProvider !== selected.provider) {
          this.recordFailover(this.currentProvider || "unknown", selected.provider, "Candidate selection");
        }

        this.currentProvider = selected.provider;

        return { result, provider: selected.provider };
      } catch (error) {
        lastError = error as Error;
        this.recordError(selected.provider, error as Error);
      }
    }

    throw new Error(`All providers failed. Last error: ${lastError?.message}`);
  }

  async failover(): Promise<boolean> {
    if (!this.currentProvider) return false;

    const currentHealth = this.health.get(this.currentProvider);
    if (currentHealth) {
      currentHealth.status = "unhealthy";
    }

    const candidates = this.getOrderedCandidates().filter((p) => p.name !== this.currentProvider);

    for (const candidate of candidates) {
      const circuitBreaker = this.circuitBreakers.get(candidate.name);
      if (circuitBreaker?.isOpen()) continue;

      this.recordFailover(this.currentProvider, candidate.name, "Health check failed");
      this.currentProvider = candidate.name;

      this.emit("failover", {
        from: this.currentProvider,
        to: candidate.name,
        reason: "Health check failed",
      });

      return true;
    }

    return false;
  }

  getOrderedCandidates(): ProviderConfig[] {
    const candidates = Array.from(this.providers.values());

    return candidates.sort((a, b) => {
      const aHealth = this.health.get(a.name);
      const bHealth = this.health.get(b.name);

      if (aHealth?.status === "unhealthy") return 1;
      if (bHealth?.status === "unhealthy") return -1;

      const aCircuit = this.circuitBreakers.get(a.name);
      const bCircuit = this.circuitBreakers.get(b.name);

      if (aCircuit?.isOpen()) return 1;
      if (bCircuit?.isOpen()) return -1;

      const aWeight = a.weight || 1;
      const bWeight = b.weight || 1;

      const aPriority = a.priority || 1;
      const bPriority = b.priority || 1;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      return bWeight - aWeight;
    });
  }

  recordSuccess(providerName: string, latency: number): void {
    const health = this.health.get(providerName);
    if (health) {
      health.successCount++;
      health.errorCount = Math.max(0, health.errorCount - 1);
      health.latency = latency;
      health.lastCheck = Date.now();
      health.status = "healthy";
    }

    const circuitBreaker = this.circuitBreakers.get(providerName);
    circuitBreaker?.recordSuccess();
  }

  recordError(providerName: string, error: Error): void {
    const health = this.health.get(providerName);
    if (health) {
      health.errorCount++;
      health.lastCheck = Date.now();
      health.lastError = error.message;

      if (health.errorCount >= 5) {
        health.status = "unhealthy";
      } else if (health.errorCount >= 2) {
        health.status = "degraded";
      }
    }

    const circuitBreaker = this.circuitBreakers.get(providerName);
    circuitBreaker?.recordFailure();

    this.emit("provider:error", { provider: providerName, error });
  }

  getHealth(providerName?: string): ProviderHealth | Map<string, ProviderHealth> {
    if (providerName) {
      return this.health.get(providerName) || {
        name: providerName,
        status: "unhealthy",
        lastCheck: 0,
        errorCount: 0,
        successCount: 0,
        latency: 0,
      };
    }
    return new Map(this.health);
  }

  getCurrentProvider(): string | null {
    return this.currentProvider;
  }

  getProvider(name: string): ProviderConfig | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  getFailoverHistory(): FailoverEvent[] {
    return [...this.failoverHistory];
  }

  resetProvider(providerName: string): void {
    const health = this.health.get(providerName);
    if (health) {
      health.status = "healthy";
      health.errorCount = 0;
      health.lastCheck = Date.now();
    }

    const circuitBreaker = this.circuitBreakers.get(providerName);
    circuitBreaker?.reset();

    if (!this.currentProvider) {
      this.currentProvider = providerName;
    }
  }

  private recordFailover(from: string, to: string, reason: string): void {
    this.failoverHistory.push({
      from,
      to,
      reason,
      timestamp: Date.now(),
    });

    if (this.failoverHistory.length > 100) {
      this.failoverHistory = this.failoverHistory.slice(-50);
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Provider request timed out after ${timeout}ms`));
      }, timeout);

      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeoutId));
    });
  }
}

class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: "closed" | "open" | "half-open" = "closed";
  private readonly threshold = 5;
  private readonly resetTimeout = 60000;

  recordSuccess(): void {
    if (this.state === "half-open") {
      this.state = "closed";
      this.failureCount = 0;
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = "open";
    }
  }

  isOpen(): boolean {
    if (this.state === "closed") return false;

    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = "half-open";
        return false;
      }
      return true;
    }

    return false;
  }

  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = "closed";
  }

  getState(): string {
    return this.state;
  }
}

export function createProviderRouter(providers: ProviderConfig[]): ProviderRouter {
  return new ProviderRouter(providers);
}
