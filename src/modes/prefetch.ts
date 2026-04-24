export interface PrefetchConfig {
  maxConcurrent: number;
  maxQueueSize: number;
  cacheSize: number;
  cacheTTL: number;
  priorityLevels: number;
  enableSpeculative: boolean;
  speculativeLookahead: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface PrefetchRequest<T = unknown> {
  id: string;
  url: string;
  priority: number;
  options?: RequestInit;
  expiresAt?: number;
  speculative: boolean;
  createdAt: number;
}

export interface PrefetchResult<T = unknown> {
  request: PrefetchRequest<T>;
  data: T;
  cached: boolean;
  loadTime: number;
  size: number;
}

export interface CacheEntry<T = unknown> {
  data: T;
  url: string;
  timestamp: number;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
}

export interface QueueMetrics {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cacheHits: number;
  cacheMisses: number;
  averageLatency: number;
  throughput: number;
}

export interface PrefetchStrategy {
  name: string;
  predict: (context: PredictionContext) => PrefetchRequest[];
  confidence: number;
}

export interface PredictionContext {
  currentPath: string;
  recentRequests: PrefetchRequest[];
  userHistory: string[];
  sessionContext: Record<string, unknown>;
}

export class PrefetchCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: PrefetchConfig;
  private accessOrder: string[] = [];

  constructor(config: PrefetchConfig) {
    this.config = config;
  }

  has(url: string): boolean {
    const entry = this.cache.get(url);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.delete(url);
      return false;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.touch(url);
    return true;
  }

  get(url: string): T | undefined {
    const entry = this.cache.get(url);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.delete(url);
      return undefined;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.touch(url);
    return entry.data;
  }

  set(url: string, data: T, ttl?: number): void {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      data,
      url,
      timestamp: now,
      expiresAt: ttl ? now + ttl : now + this.config.cacheTTL,
      accessCount: 1,
      lastAccessed: now,
      size: this.estimateSize(data),
    };

    if (this.cache.size >= this.config.cacheSize) {
      this.evict();
    }

    this.cache.set(url, entry);
    this.accessOrder.push(url);
  }

  delete(url: string): boolean {
    const removed = this.cache.delete(url);
    if (removed) {
      this.accessOrder = this.accessOrder.filter(u => u !== url);
    }
    return removed;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  private touch(url: string): void {
    this.accessOrder = this.accessOrder.filter(u => u !== url);
    this.accessOrder.push(url);
  }

  private evict(): void {
    if (this.accessOrder.length === 0) return;

    const lruUrl = this.accessOrder[0];
    this.delete(lruUrl);
  }

  private estimateSize(data: T): number {
    if (typeof data === 'string') {
      return data.length * 2;
    }
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }
    if (data instanceof Uint8Array) {
      return data.byteLength;
    }
    try {
      return JSON.stringify(data).length * 2;
    } catch {
      return 0;
    }
  }

  getStats(): { size: number; maxSize: number; hitRate: number } {
    let totalAccess = 0;
    for (const entry of this.cache.values()) {
      totalAccess += entry.accessCount;
    }

    return {
      size: this.cache.size,
      maxSize: this.config.cacheSize,
      hitRate: this.cache.size > 0 ? totalAccess / this.cache.size : 0,
    };
  }
}

export class ParallelPrefetcher<T = unknown> {
  private config: PrefetchConfig;
  private cache: PrefetchCache<T>;
  private queue: PrefetchRequest<T>[] = [];
  private processing: Set<string> = new Set();
  private results: Map<string, PrefetchResult<T>> = new Map();
  private metrics: QueueMetrics = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageLatency: 0,
    throughput: 0,
  };
  private strategies: PrefetchStrategy[] = [];
  private workerCount: number = 0;
  private lastThroughputCheck: number = Date.now();

  constructor(config: Partial<PrefetchConfig> = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 5,
      maxQueueSize: config.maxQueueSize ?? 100,
      cacheSize: config.cacheSize ?? 50,
      cacheTTL: config.cacheTTL ?? 5 * 60 * 1000,
      priorityLevels: config.priorityLevels ?? 3,
      enableSpeculative: config.enableSpeculative ?? true,
      speculativeLookahead: config.speculativeLookahead ?? 3,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };

    this.cache = new PrefetchCache<T>(this.config);
  }

  async prefetch(url: string, options?: RequestInit, priority: number = 0): Promise<PrefetchResult<T>> {
    const request: PrefetchRequest<T> = {
      id: this.generateRequestId(),
      url,
      priority,
      options,
      speculative: false,
      createdAt: Date.now(),
    };

    if (this.cache.has(url)) {
      this.metrics.cacheHits++;
      const cached = this.cache.get(url)!;
      return {
        request,
        data: cached,
        cached: true,
        loadTime: 0,
        size: 0,
      };
    }

    this.metrics.cacheMisses++;
    return this.enqueue(request);
  }

  async prefetchSpeculative(requests: PrefetchRequest<T>[]): Promise<void> {
    if (!this.config.enableSpeculative) return;

    const sorted = requests
      .filter(r => !this.cache.has(r.url) && !this.processing.has(r.id))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.config.speculativeLookahead);

    for (const request of sorted) {
      this.enqueue({ ...request, speculative: true });
    }
  }

  private async enqueue(request: PrefetchRequest<T>): Promise<PrefetchResult<T>> {
    if (this.queue.length >= this.config.maxQueueSize) {
      this.queue.sort((a, b) => b.priority - a.priority);
      this.queue.pop();
    }

    request.expiresAt = Date.now() + this.config.cacheTTL;
    this.queue.push(request);
    this.queue.sort((a, b) => b.priority - a.priority);
    this.metrics.pending++;

    return this.processNext();
  }

  private async processNext(): Promise<PrefetchResult<T>> {
    while (this.processing.size >= this.config.maxConcurrent) {
      await this.waitForSlot();
    }

    const request = this.queue.find(r => !this.processing.has(r.id));
    if (!request) {
      throw new Error('No pending requests');
    }

    return this.executeRequest(request);
  }

  private async executeRequest(request: PrefetchRequest<T>): Promise<PrefetchResult<T>> {
    this.processing.add(request.id);
    this.metrics.pending--;
    this.metrics.processing++;
    const startTime = Date.now();

    try {
      const response = await this.fetchWithRetry(request);
      const loadTime = Date.now() - startTime;

      this.cache.set(request.url, response.data as T);

      const result: PrefetchResult<T> = {
        request,
        data: response.data as T,
        cached: false,
        loadTime,
        size: response.size,
      };

      this.results.set(request.id, result);
      this.processing.delete(request.id);
      this.metrics.processing--;
      this.metrics.completed++;
      this.updateLatency(loadTime);

      this.processNext();

      return result;
    } catch (error) {
      this.processing.delete(request.id);
      this.metrics.processing--;
      this.metrics.failed++;
      throw error;
    }
  }

  private async fetchWithRetry(request: PrefetchRequest<T>): Promise<{ data: unknown; size: number }> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(request.url, {
          ...request.options,
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const size = parseInt(response.headers.get('content-length') || '0', 10) || JSON.stringify(data).length;

        return { data, size };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.retryAttempts - 1) {
          await this.delay(this.config.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError;
  }

  private waitForSlot(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (this.processing.size < this.config.maxConcurrent) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  private updateLatency(latency: number): void {
    const alpha = 0.1;
    this.metrics.averageLatency = alpha * latency + (1 - alpha) * this.metrics.averageLatency;

    const now = Date.now();
    const elapsed = (now - this.lastThroughputCheck) / 1000;
    if (elapsed >= 1) {
      this.metrics.throughput = this.metrics.completed / elapsed;
      this.lastThroughputCheck = now;
    }
  }

  addStrategy(strategy: PrefetchStrategy): void {
    this.strategies.push(strategy);
  }

  async predictAndPrefetch(context: PredictionContext): Promise<void> {
    const requests: PrefetchRequest<T>[] = [];

    for (const strategy of this.strategies) {
      const predicted = strategy.predict(context);
      requests.push(...predicted);
    }

    if (requests.length > 0) {
      await this.prefetchSpeculative(requests);
    }
  }

  getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }

  getQueue(): PrefetchRequest<T>[] {
    return [...this.queue];
  }

  getProcessing(): string[] {
    return Array.from(this.processing);
  }

  clear(): void {
    this.queue = [];
    this.processing.clear();
    this.results.clear();
  }

  private generateRequestId(): string {
    return `prefetch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class DependencyGraph<T = unknown> {
  private nodes: Map<string, Set<string>> = new Map();
  private inverse: Map<string, Set<string>> = new Map();
  private data: Map<string, T> = new Map();

  addNode(id: string, dependencies: string[] = []): void {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, new Set());
    }
    if (!this.inverse.has(id)) {
      this.inverse.set(id, new Set());
    }

    for (const dep of dependencies) {
      this.nodes.get(id)!.add(dep);
      if (!this.inverse.has(dep)) {
        this.inverse.set(dep, new Set());
      }
      this.inverse.get(dep)!.add(id);
    }
  }

  getDependencies(id: string): string[] {
    return Array.from(this.nodes.get(id) || []);
  }

  getDependents(id: string): string[] {
    return Array.from(this.inverse.get(id) || []);
  }

  getExecutionOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (node: string) => {
      if (visited.has(node)) return;
      visited.add(node);

      for (const dep of this.nodes.get(node) || []) {
        visit(dep);
      }

      order.push(node);
    };

    for (const node of this.nodes.keys()) {
      visit(node);
    }

    return order;
  }

  getParallelBatches(): string[][] {
    const batches: string[][] = [];
    const remaining = new Set(this.nodes.keys());
    const completed = new Set<string>();

    while (remaining.size > 0) {
      const batch: string[] = [];

      for (const node of remaining) {
        const deps = this.nodes.get(node) || new Set();
        const allDepsCompleted = [...deps].every(dep => completed.has(dep));

        if (allDepsCompleted) {
          batch.push(node);
        }
      }

      if (batch.length === 0 && remaining.size > 0) {
        batch.push([...remaining][0]);
      }

      for (const node of batch) {
        remaining.delete(node);
        completed.add(node);
      }

      batches.push(batch);
    }

    return batches;
  }

  hasCycle(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      for (const neighbor of this.nodes.get(node) || []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of this.nodes.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) return true;
      }
    }

    return false;
  }

  setData(id: string, data: T): void {
    this.data.set(id, data);
  }

  getData(id: string): T | undefined {
    return this.data.get(id);
  }

  clear(): void {
    this.nodes.clear();
    this.inverse.clear();
    this.data.clear();
  }
}

export function createPrefetcher<T = unknown>(config?: Partial<PrefetchConfig>): ParallelPrefetcher<T> {
  return new ParallelPrefetcher<T>(config);
}

export function createDependencyGraph<T = unknown>(): DependencyGraph<T> {
  return new DependencyGraph<T>();
}

export const DEFAULT_PREFETCH_CONFIG: PrefetchConfig = {
  maxConcurrent: 5,
  maxQueueSize: 100,
  cacheSize: 50,
  cacheTTL: 5 * 60 * 1000,
  priorityLevels: 3,
  enableSpeculative: true,
  speculativeLookahead: 3,
  retryAttempts: 3,
  retryDelay: 1000,
};
