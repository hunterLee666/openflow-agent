export class BoundedUUIDSet {
  private readonly set = new Set<string>();
  private readonly queue: string[] = [];

  constructor(private readonly maxSize: number) {
    if (maxSize <= 0) {
      throw new Error('maxSize must be positive');
    }
  }

  add(id: string): boolean {
    if (this.set.has(id)) {
      return false;
    }

    this.set.add(id);
    this.queue.push(id);

    while (this.queue.length > this.maxSize) {
      const old = this.queue.shift()!;
      this.set.delete(old);
    }

    return true;
  }

  has(id: string): boolean {
    return this.set.has(id);
  }

  get size(): number {
    return this.set.size;
  }

  clear(): void {
    this.set.clear();
    this.queue.length = 0;
  }

  getEvictionCount(): number {
    return Math.max(0, this.queue.length - this.maxSize);
  }
}

export class LRUSet {
  private readonly map = new Map<string, true>();

  constructor(private readonly maxSize: number) {
    if (maxSize <= 0) {
      throw new Error('maxSize must be positive');
    }
  }

  add(id: string): boolean {
    if (this.map.has(id)) {
      this.map.delete(id);
      this.map.set(id, true);
      return false;
    }

    this.map.set(id, true);

    while (this.map.size > this.maxSize) {
      const first = this.map.keys().next().value;
      if (first) {
        this.map.delete(first);
      }
    }

    return true;
  }

  touch(id: string): void {
    if (this.map.has(id)) {
      this.map.delete(id);
      this.map.set(id, true);
    }
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

export interface BoundedSetMetrics {
  size: number;
  maxSize: number;
  hitRate: number;
  missRate: number;
  totalAdds: number;
  totalHits: number;
  totalMisses: number;
  evictions: number;
}

export class BoundedSetWithMetrics extends BoundedUUIDSet {
  private totalAdds = 0;
  private totalHits = 0;
  private totalMisses = 0;
  private evictions = 0;

  constructor(maxSize: number) {
    super(maxSize);
  }

  add(id: string): boolean {
    this.totalAdds++;
    const isNew = super.add(id);

    if (!isNew && this.size >= (this as any).maxSize) {
      this.evictions++;
    }

    return isNew;
  }

  has(id: string): boolean {
    const exists = super.has(id);
    if (exists) {
      this.totalHits++;
    } else {
      this.totalMisses++;
    }
    return exists;
  }

  getMetrics(): BoundedSetMetrics {
    const total = this.totalHits + this.totalMisses;
    return {
      size: this.size,
      maxSize: (this as any).maxSize,
      hitRate: total > 0 ? this.totalHits / total : 0,
      missRate: total > 0 ? this.totalMisses / total : 0,
      totalAdds: this.totalAdds,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      evictions: this.evictions,
    };
  }

  resetMetrics(): void {
    this.totalAdds = 0;
    this.totalHits = 0;
    this.totalMisses = 0;
    this.evictions = 0;
  }
}
