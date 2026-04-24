export interface VirtualItem<T = unknown> {
  index: number;
  start: number;
  end: number;
  size: number;
  data: T;
}

export interface VirtualizerOptions<T = unknown> {
  items: T[];
  itemHeight: number | ((index: number) => number);
  overscan?: number;
  scrollOffset?: number;
  getItemKey?: (index: number) => string;
  onItemsChange?: (items: T[]) => void;
}

export interface VirtualizerConfig {
  overscan: number;
  estimateSize: number;
  paddingStart: number;
  paddingEnd: number;
}

export const DEFAULT_VIRTUALIZER_CONFIG: VirtualizerConfig = {
  overscan: 3,
  estimateSize: 50,
  paddingStart: 0,
  paddingEnd: 0,
};

export class Virtualizer<T = unknown> {
  private items: T[];
  private itemHeights: Map<number, number> = new Map();
  private itemOffsets: number[] = [];
  private config: VirtualizerConfig;
  private totalHeight: number = 0;
  private getItemKey?: (index: number) => string;
  private listeners: Set<() => void> = new Set();
  private cachedRange: { startIndex: number; endIndex: number } = { startIndex: -1, endIndex: -1 };
  private cachedItems: VirtualItem<T>[] = [];

  constructor(options: VirtualizerOptions<T>) {
    this.items = options.items || [];
    this.getItemKey = options.getItemKey;

    const itemHeight = options.itemHeight;
    this.config = {
      overscan: options.overscan ?? DEFAULT_VIRTUALIZER_CONFIG.overscan,
      estimateSize:
        typeof itemHeight === "number"
          ? itemHeight
          : DEFAULT_VIRTUALIZER_CONFIG.estimateSize,
      paddingStart: options.scrollOffset ?? DEFAULT_VIRTUALIZER_CONFIG.paddingStart,
      paddingEnd: DEFAULT_VIRTUALIZER_CONFIG.paddingEnd,
    };

    this.recalculate();
  }

  setItems(items: T[]): void {
    this.items = items;
    this.itemOffsets = [];
    this.itemHeights.clear();
    this.cachedRange = { startIndex: -1, endIndex: -1 };
    this.cachedItems = [];
    this.recalculate();
    this.notifyListeners();
  }

  getItems(): T[] {
    return this.items;
  }

  getVirtualItems(range?: { startIndex: number; endIndex: number }): VirtualItem<T>[] {
    if (range) {
      return this.calculateRange(range.startIndex, range.endIndex);
    }

    if (this.cachedRange.startIndex !== -1) {
      return this.cachedItems;
    }

    return this.cachedItems;
  }

  getTotalHeight(): number {
    return this.totalHeight;
  }

  getItemAt(index: number): T | undefined {
    return this.items[index];
  }

  indexOf(key: string): number {
    if (!this.getItemKey) {
      return -1;
    }

    for (let i = 0; i < this.items.length; i++) {
      if (this.getItemKey(i) === key) {
        return i;
      }
    }

    return -1;
  }

  scrollTo(index: number, align: "start" | "center" | "end" = "start"): number {
    if (index < 0 || index >= this.items.length) {
      return 0;
    }

    const offset = this.getItemOffset(index);

    switch (align) {
      case "center":
        return offset - this.config.estimateSize / 2;
      case "end":
        return offset - this.getViewportSize();
      default:
        return offset;
    }
  }

  getItemOffset(index: number): number {
    if (index < 0 || index >= this.itemOffsets.length) {
      return 0;
    }
    return this.itemOffsets[index];
  }

  getItemSize(index: number): number {
    if (this.itemHeights.has(index)) {
      return this.itemHeights.get(index)!;
    }

    const itemHeight = this.config.estimateSize;
    this.itemHeights.set(index, itemHeight);
    return itemHeight;
  }

  setItemSize(index: number, size: number): void {
    if (index < 0 || index >= this.items.length) {
      return;
    }

    const oldSize = this.getItemSize(index);
    if (oldSize === size) {
      return;
    }

    this.itemHeights.set(index, size);
    this.recalculate();

    this.cachedRange = { startIndex: -1, endIndex: -1 };
    this.notifyListeners();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getVirtualRange(
    scrollOffset: number,
    viewportHeight: number
  ): { startIndex: number; endIndex: number; items: VirtualItem<T>[] } {
    const startIndex = this.findIndex(scrollOffset);
    const endIndex = this.findIndex(scrollOffset + viewportHeight);

    const overscanStart = Math.max(0, startIndex - this.config.overscan);
    const overscanEnd = Math.min(this.items.length - 1, endIndex + this.config.overscan);

    if (
      this.cachedRange.startIndex === overscanStart &&
      this.cachedRange.endIndex === overscanEnd
    ) {
      return {
        startIndex: overscanStart,
        endIndex: overscanEnd,
        items: this.cachedItems,
      };
    }

    this.cachedRange = { startIndex: overscanStart, endIndex: overscanEnd };
    this.cachedItems = this.calculateRange(overscanStart, overscanEnd);

    return {
      startIndex: overscanStart,
      endIndex: overscanEnd,
      items: this.cachedItems,
    };
  }

  private calculateRange(startIndex: number, endIndex: number): VirtualItem<T>[] {
    const items: VirtualItem<T>[] = [];

    for (let i = startIndex; i <= endIndex && i < this.items.length; i++) {
      items.push({
        index: i,
        start: this.itemOffsets[i] || 0,
        end: (this.itemOffsets[i + 1] ?? this.totalHeight),
        size: this.getItemSize(i),
        data: this.items[i],
      });
    }

    return items;
  }

  private findIndex(offset: number): number {
    if (this.itemOffsets.length === 0) {
      return 0;
    }

    let low = 0;
    let high = this.itemOffsets.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midOffset = this.itemOffsets[mid];

      if (midOffset <= offset) {
        if (mid === this.itemOffsets.length - 1 || this.itemOffsets[mid + 1] > offset) {
          return mid;
        }
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return Math.max(0, low);
  }

  private getViewportSize(): number {
    return this.config.estimateSize;
  }

  private recalculate(): void {
    this.itemOffsets = [];
    this.totalHeight = this.config.paddingStart;

    for (let i = 0; i < this.items.length; i++) {
      const size = this.getItemSize(i);
      this.itemOffsets.push(this.totalHeight);
      this.totalHeight += size;
    }

    this.totalHeight += this.config.paddingEnd;
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error("Virtualizer listener error:", e);
      }
    }
  }

  getStats(): {
    totalItems: number;
    totalHeight: number;
    cachedItems: number;
    measuredItems: number;
  } {
    return {
      totalItems: this.items.length,
      totalHeight: this.totalHeight,
      cachedItems: this.cachedItems.length,
      measuredItems: this.itemHeights.size,
    };
  }
}

export class DynamicSizeVirtualizer<T = unknown> extends Virtualizer<T> {
  private pendingMeasures: Map<number, () => number> = new Map();
  private measureBatch: number[] = [];
  private measureTimeoutId?: NodeJS.Timeout;

  constructor(options: VirtualizerOptions<T>) {
    super({
      ...options,
      itemHeight: () => DEFAULT_VIRTUALIZER_CONFIG.estimateSize,
    });
  }

  measureItem(index: number, measureFn: () => number): void {
    this.pendingMeasures.set(index, measureFn);

    if (!this.measureBatch.includes(index)) {
      this.measureBatch.push(index);
    }

    this.scheduleMeasure();
  }

  private scheduleMeasure(): void {
    if (this.measureTimeoutId) {
      return;
    }

    this.measureTimeoutId = setTimeout(() => {
      this.measureBatchItems();
      this.measureTimeoutId = undefined;
    }, 16);
  }

  private measureBatchItems(): void {
    for (const index of this.measureBatch) {
      const measureFn = this.pendingMeasures.get(index);
      if (measureFn) {
        const size = measureFn();
        this.setItemSize(index, size);
        this.pendingMeasures.delete(index);
      }
    }

    this.measureBatch = [];
  }

  flushMeasures(): void {
    if (this.measureTimeoutId) {
      clearTimeout(this.measureTimeoutId);
      this.measureTimeoutId = undefined;
    }
    this.measureBatchItems();
  }
}

export function createVirtualizer<T>(
  options: VirtualizerOptions<T>
): Virtualizer<T> {
  return new Virtualizer(options);
}

export function createDynamicVirtualizer<T>(
  options: VirtualizerOptions<T>
): DynamicSizeVirtualizer<T> {
  return new DynamicSizeVirtualizer(options);
}
