import { readFileSync, writeFileSync, existsSync, FSWatcher, watch } from "fs";
import { join, dirname } from "path";
import { EventEmitter } from "events";

export interface ConfigChangeEvent {
  source: string;
  path: string;
  timestamp: number;
  previousSettings?: unknown;
  newSettings: unknown;
}

export interface HotReloadConfig {
  debounceMs: number;
  maxRetries: number;
  retryDelayMs: number;
  onError?: (error: Error) => void;
}

export class ConfigHotReloader extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map();
  private configCache: Map<string, unknown> = new Map();
  private retryCount: Map<string, number> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private configDir: string,
    private defaultConfig: Record<string, unknown>,
    private config: Partial<HotReloadConfig> = {}
  ) {
    super();
    this.config = {
      debounceMs: 300,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config,
    };
  }

  watch(paths: string[]): void {
    for (const p of paths) {
      this.watchConfig(p);
    }
  }

  private watchConfig(filePath: string): void {
    if (this.watchers.has(filePath)) {
      return;
    }

    try {
      const fullPath = join(this.configDir, filePath);

      if (!existsSync(fullPath)) {
        this.ensureConfigExists(fullPath);
      }

      const watcher = watch(fullPath, (eventType) => {
        if (eventType === "change") {
          this.handleChange(filePath, fullPath);
        }
      });

      this.watchers.set(filePath, watcher);
      this.configCache.set(filePath, this.loadConfig(fullPath));
    } catch (error) {
      this.handleError(filePath, error as Error);
    }
  }

  private handleChange(filePath: string, fullPath: string): void {
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.reloadConfig(filePath, fullPath);
      this.debounceTimers.delete(filePath);
    }, this.config.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  private reloadConfig(filePath: string, fullPath: string): void {
    const previousSettings = this.configCache.get(filePath);

    try {
      const newSettings = this.loadConfig(fullPath);
      this.configCache.set(filePath, newSettings);
      this.retryCount.delete(filePath);

      const event: ConfigChangeEvent = {
        source: filePath,
        path: fullPath,
        timestamp: Date.now(),
        previousSettings,
        newSettings,
      };

      this.emit("change", event);
    } catch (error) {
      this.handleError(filePath, error as Error);
    }
  }

  private handleError(filePath: string, error: Error): void {
    const retries = this.retryCount.get(filePath) || 0;

    if (retries < (this.config.maxRetries || 3)) {
      this.retryCount.set(filePath, retries + 1);

      setTimeout(() => {
        const fullPath = join(this.configDir, filePath);
        this.reloadConfig(filePath, fullPath);
      }, this.config.retryDelayMs || 1000);
    } else {
      this.emit("error", error);
      if (this.config.onError) {
        this.config.onError(error);
      }
    }
  }

  private loadConfig(path: string): unknown {
    try {
      if (!existsSync(path)) {
        return null;
      }
      const content = readFileSync(path, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load config from ${path}:`, error);
      return null;
    }
  }

  private ensureConfigExists(path: string): void {
    const dir = dirname(path);
    const fileName = path.split("/").pop();

    if (!existsSync(dir)) {
      const { mkdirSync } = require("fs");
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(path) && this.defaultConfig) {
      const defaultForFile = this.defaultConfig[fileName || ""] || {};
      writeFileSync(path, JSON.stringify(defaultForFile, null, 2), "utf-8");
    }
  }

  getConfig(path: string): unknown {
    return this.configCache.get(path) || null;
  }

  unwatch(path?: string): void {
    if (path) {
      const watcher = this.watchers.get(path);
      if (watcher) {
        watcher.close();
        this.watchers.delete(path);
      }
      const timer = this.debounceTimers.get(path);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(path);
      }
    } else {
      for (const [p, watcher] of this.watchers) {
        watcher.close();
        const timer = this.debounceTimers.get(p);
        if (timer) {
          clearTimeout(timer);
        }
      }
      this.watchers.clear();
      this.debounceTimers.clear();
    }
  }

  async forceReload(path: string): Promise<unknown> {
    const fullPath = join(this.configDir, path);
    const settings = this.loadConfig(fullPath);
    this.configCache.set(path, settings);
    return settings;
  }
}

export interface LayeredConfigSource {
  name: string;
  priority: number;
  path: string;
  data: Record<string, unknown>;
}

export class LayeredConfigManager extends EventEmitter {
  private sources: LayeredConfigSource[] = [];
  private mergedCache: Map<string, unknown> = new Map();
  private hotReloader?: ConfigHotReloader;

  constructor(
    private configDir: string,
    private hotReloadEnabled: boolean = true
  ) {
    super();
    if (hotReloadEnabled) {
      this.hotReloader = new ConfigHotReloader(configDir, {});
      this.hotReloader.on("change", (event: ConfigChangeEvent) => {
        this.invalidateCache();
        this.emit("configChanged", event);
      });
    }
  }

  addSource(name: string, priority: number, data: Record<string, unknown>): void {
    const existingIndex = this.sources.findIndex(s => s.name === name);
    if (existingIndex !== -1) {
      this.sources[existingIndex] = { name, priority, path: "", data };
    } else {
      this.sources.push({ name, priority, path: "", data });
      this.sources.sort((a, b) => b.priority - a.priority);
    }
    this.invalidateCache();
  }

  addSourceFromFile(name: string, priority: number, path: string): void {
    const fullPath = path.startsWith("/") ? path : join(this.configDir, path);

    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        const data = JSON.parse(content);
        this.sources.push({ name, priority, path: fullPath, data });
        this.sources.sort((a, b) => b.priority - a.priority);
        this.invalidateCache();

        if (this.hotReloadEnabled && this.hotReloader) {
          this.hotReloader.watch([fullPath]);
        }
      } catch (error) {
        console.error(`Failed to load config from ${fullPath}:`, error);
      }
    }
  }

  removeSource(name: string): void {
    const index = this.sources.findIndex(s => s.name === name);
    if (index !== -1) {
      this.sources.splice(index, 1);
      this.invalidateCache();
    }
  }

  get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    const cacheKey = `key:${key}`;

    if (this.mergedCache.has(cacheKey)) {
      return this.mergedCache.get(cacheKey) as T;
    }

    for (const source of this.sources) {
      const value = this.getNestedValue(source.data, key);
      if (value !== undefined) {
        this.mergedCache.set(cacheKey, value);
        return value as T;
      }
    }

    return defaultValue;
  }

  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const source of this.sources) {
      this.mergeDeep(result, source.data);
    }

    return result;
  }

  set(key: string, value: unknown, sourceName?: string): void {
    if (sourceName) {
      const source = this.sources.find(s => s.name === sourceName);
      if (source) {
        this.setNestedValue(source.data, key, value);
        this.invalidateCache();
      }
    } else if (this.sources.length > 0) {
      this.setNestedValue(this.sources[0].data, key, value);
      this.invalidateCache();
    }
  }

  private getNestedValue(obj: Record<string, unknown>, key: string): unknown {
    const parts = key.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
    const parts = key.split(".");
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  private mergeDeep(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === "object" &&
        !Array.isArray(targetValue)
      ) {
        this.mergeDeep(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
        target[key] = targetValue;
      } else {
        target[key] = sourceValue;
      }
    }
  }

  private invalidateCache(): void {
    this.mergedCache.clear();
  }

  getSources(): LayeredConfigSource[] {
    return [...this.sources];
  }

  destroy(): void {
    if (this.hotReloader) {
      this.hotReloader.unwatch();
    }
    this.sources = [];
    this.mergedCache.clear();
    this.removeAllListeners();
  }
}
