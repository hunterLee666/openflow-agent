export interface BoundedUUIDConfig {
  maxSize: number;
  ttl?: number;
  evictionPolicy: 'lru' | 'fifo' | 'lfu';
}

export interface UUIDEntry<T = unknown> {
  uuid: string;
  data: T;
  accessCount: number;
  lastAccessed: number;
  createdAt: number;
}

export class BoundedUUIDSet<T = unknown> {
  protected items: Map<string, UUIDEntry<T>>;
  protected accessOrder: string[];
  private config: BoundedUUIDConfig;

  constructor(config: BoundedUUIDSetConfig) {
    this.config = config;
    this.items = new Map();
    this.accessOrder = [];
  }

  add(uuid: string, data: T): boolean {
    if (this.items.has(uuid)) {
      this.touch(uuid);
      return false;
    }

    if (this.items.size >= this.config.maxSize) {
      this.evict();
    }

    const entry: UUIDEntry<T> = {
      uuid,
      data,
      accessCount: 1,
      lastAccessed: Date.now(),
      createdAt: Date.now(),
    };

    this.items.set(uuid, entry);
    this.accessOrder.push(uuid);
    return true;
  }

  has(uuid: string): boolean {
    if (!this.items.has(uuid)) {
      return false;
    }

    if (this.isExpired(uuid)) {
      this.remove(uuid);
      return false;
    }

    this.touch(uuid);
    return true;
  }

  get(uuid: string): T | undefined {
    const entry = this.items.get(uuid);
    if (!entry) {
      return undefined;
    }

    if (this.isExpired(uuid)) {
      this.remove(uuid);
      return undefined;
    }

    this.touch(uuid);
    return entry.data;
  }

  remove(uuid: string): boolean {
    const removed = this.items.delete(uuid);
    if (removed) {
      this.accessOrder = this.accessOrder.filter(id => id !== uuid);
    }
    return removed;
  }

  clear(): void {
    this.items.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.items.size;
  }

  keys(): string[] {
    return Array.from(this.items.keys());
  }

  values(): T[] {
    return Array.from(this.items.values()).map(entry => entry.data);
  }

  entries(): [string, T][] {
    return Array.from(this.items.entries()).map(([uuid, entry]) => [uuid, entry.data]);
  }

  private touch(uuid: string): void {
    const entry = this.items.get(uuid);
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.accessCount++;
    }
  }

  private isExpired(uuid: string): boolean {
    const entry = this.items.get(uuid);
    if (!entry || !this.config.ttl) {
      return false;
    }
    return Date.now() - entry.lastAccessed > this.config.ttl;
  }

  private evict(): void {
    let victim: string | undefined;

    switch (this.config.evictionPolicy) {
      case 'lru':
        victim = this.evictLRU();
        break;
      case 'fifo':
        victim = this.evictFIFO();
        break;
      case 'lfu':
        victim = this.evictLFU();
        break;
    }

    if (victim) {
      this.remove(victim);
    }
  }

  protected evictLRU(): string | undefined {
    let oldest: string | undefined;
    let oldestTime = Infinity;

    for (const entry of this.items.values()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldest = entry.uuid;
      }
    }

    return oldest;
  }

  private evictFIFO(): string | undefined {
    if (this.accessOrder.length === 0) {
      return undefined;
    }
    return this.accessOrder[0];
  }

  private evictLFU(): string | undefined {
    let leastUsed: string | undefined;
    let leastCount = Infinity;

    for (const entry of this.items.values()) {
      if (entry.accessCount < leastCount) {
        leastCount = entry.accessCount;
        leastUsed = entry.uuid;
      }
    }

    return leastUsed;
  }

  pruneExpired(): number {
    let pruned = 0;
    const toRemove: string[] = [];

    for (const [uuid, entry] of this.items.entries()) {
      if (this.config.ttl && Date.now() - entry.lastAccessed > this.config.ttl) {
        toRemove.push(uuid);
      }
    }

    for (const uuid of toRemove) {
      this.remove(uuid);
      pruned++;
    }

    return pruned;
  }

  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    evictionPolicy: string;
  } {
    let totalAccess = 0;
    for (const entry of this.items.values()) {
      totalAccess += entry.accessCount;
    }

    return {
      size: this.items.size,
      maxSize: this.config.maxSize,
      hitRate: this.items.size > 0 ? totalAccess / this.items.size : 0,
      evictionPolicy: this.config.evictionPolicy,
    };
  }
}

export type BoundedUUIDSetConfig = BoundedUUIDConfig;

export function createBoundedUUIDSet<T = unknown>(
  maxSize: number,
  evictionPolicy: 'lru' | 'fifo' | 'lfu' = 'lru',
  ttl?: number
): BoundedUUIDSet<T> {
  return new BoundedUUIDSet<T>({
    maxSize,
    evictionPolicy,
    ttl,
  });
}

export class MemoryBoundedUUIDSet extends BoundedUUIDSet {
  private memoryUsage: number = 0;
  private maxMemoryBytes: number;

  constructor(maxSize: number, maxMemoryBytes: number, evictionPolicy: 'lru' | 'fifo' | 'lfu' = 'lru', ttl?: number) {
    super({ maxSize, evictionPolicy, ttl });
    this.maxMemoryBytes = maxMemoryBytes;
  }

  override add(uuid: string, data: unknown): boolean {
    const dataSize = this.estimateSize(data);

    if (this.memoryUsage + dataSize > this.maxMemoryBytes) {
      this.pruneByMemory(dataSize);
    }

    const result = super.add(uuid, data);
    if (result) {
      this.memoryUsage += dataSize;
    }
    return result;
  }

  override remove(uuid: string): boolean {
    const entry = (this.items as Map<string, UUIDEntry<unknown>>).get(uuid);
    if (entry) {
      this.memoryUsage -= this.estimateSize(entry.data);
    }
    return super.remove(uuid);
  }

  override clear(): void {
    super.clear();
    this.memoryUsage = 0;
  }

  private estimateSize(data: unknown): number {
    if (typeof data === 'string') {
      return data.length * 2;
    }
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }
    if (data instanceof Uint8Array) {
      return data.byteLength;
    }
    return JSON.stringify(data).length * 2;
  }

  private pruneByMemory(requiredBytes: number): void {
    while (this.memoryUsage + requiredBytes > this.maxMemoryBytes && this.size() > 0) {
      const oldest = this.evictLRU();
      if (oldest) {
        this.remove(oldest);
      } else {
        break;
      }
    }
  }

  getMemoryUsage(): { used: number; max: number; percent: number } {
    return {
      used: this.memoryUsage,
      max: this.maxMemoryBytes,
      percent: (this.memoryUsage / this.maxMemoryBytes) * 100,
    };
  }
}
