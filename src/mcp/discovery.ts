import { EventEmitter } from "events";
import type { ToolDefinition } from "../types/index.js";

export type ServiceState = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export interface ServiceEndpoint {
  id: string;
  name: string;
  url: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface ServiceInstance {
  id: string;
  endpoint: ServiceEndpoint;
  state: ServiceState;
  lastConnected?: number;
  lastError?: string;
  errorCount: number;
  healthScore: number;
}

export interface DiscoveryConfig {
  refreshIntervalMs: number;
  healthCheckIntervalMs: number;
  maxReconnectAttempts: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  healthCheckTimeoutMs: number;
  minHealthyRatio: number;
}

export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  refreshIntervalMs: 30000,
  healthCheckIntervalMs: 10000,
  maxReconnectAttempts: 5,
  reconnectBaseDelayMs: 1000,
  reconnectMaxDelayMs: 30000,
  healthCheckTimeoutMs: 5000,
  minHealthyRatio: 0.5,
};

export interface ServiceRegistry {
  register(instance: ServiceInstance): void;
  unregister(id: string): void;
  get(id: string): ServiceInstance | undefined;
  getAll(): ServiceInstance[];
  getHealthy(): ServiceInstance[];
  updateState(id: string, state: ServiceState, error?: string): void;
}

export class DefaultServiceRegistry implements ServiceRegistry {
  private instances: Map<string, ServiceInstance> = new Map();
  private listeners: Map<string, Array<(instance: ServiceInstance) => void>> = new Map();

  register(instance: ServiceInstance): void {
    this.instances.set(instance.id, instance);
    this.notifyListeners(instance);
  }

  unregister(id: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      this.instances.delete(id);
      this.notifyListeners({ ...instance, state: "disconnected" });
    }
  }

  get(id: string): ServiceInstance | undefined {
    return this.instances.get(id);
  }

  getAll(): ServiceInstance[] {
    return Array.from(this.instances.values());
  }

  getHealthy(): ServiceInstance[] {
    return this.getAll().filter(
      (i) => i.state === "connected" && i.healthScore >= 0.5
    );
  }

  updateState(id: string, state: ServiceState, error?: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.state = state;
      if (error) {
        instance.lastError = error;
        instance.errorCount++;
      }
      if (state === "connected") {
        instance.lastConnected = Date.now();
        instance.errorCount = 0;
        instance.lastError = undefined;
      }
      this.notifyListeners(instance);
    }
  }

  onUpdate(id: string, listener: (instance: ServiceInstance) => void): () => void {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, []);
    }
    this.listeners.get(id)!.push(listener);

    return () => {
      const listeners = this.listeners.get(id);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  private notifyListeners(instance: ServiceInstance): void {
    const listeners = this.listeners.get(instance.id);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(instance);
        } catch (e) {
          console.error(`Listener error for ${instance.id}:`, e);
        }
      }
    }
  }
}

export interface LoadBalancerStrategy {
  select(instances: ServiceInstance[]): ServiceInstance | null;
}

export class RoundRobinStrategy implements LoadBalancerStrategy {
  private counters: Map<string, number> = new Map();

  select(instances: ServiceInstance[]): ServiceInstance | null {
    if (instances.length === 0) return null;

    const healthy = instances.filter((i) => i.state === "connected" && i.healthScore >= 0.5);
    if (healthy.length === 0) return null;

    const id = healthy[0].id;
    const count = (this.counters.get(id) || 0) + 1;
    this.counters.set(id, count % healthy.length);

    return healthy[this.counters.get(id)!];
  }
}

export class WeightedRandomStrategy implements LoadBalancerStrategy {
  select(instances: ServiceInstance[]): ServiceInstance | null {
    const healthy = instances.filter((i) => i.state === "connected" && i.healthScore >= 0.5);
    if (healthy.length === 0) return null;

    const totalWeight = healthy.reduce((sum, i) => sum + (i.endpoint.weight || 1), 0);
    let random = Math.random() * totalWeight;

    for (const instance of healthy) {
      random -= instance.endpoint.weight || 1;
      if (random <= 0) {
        return instance;
      }
    }

    return healthy[healthy.length - 1];
  }
}

export class LeastConnectionsStrategy implements LoadBalancerStrategy {
  private connections: Map<string, number> = new Map();

  select(instances: ServiceInstance[]): ServiceInstance | null {
    const healthy = instances.filter((i) => i.state === "connected" && i.healthScore >= 0.5);
    if (healthy.length === 0) return null;

    let minConnections = Infinity;
    let selected: ServiceInstance | null = null;

    for (const instance of healthy) {
      const connCount = this.connections.get(instance.id) || 0;
      if (connCount < minConnections) {
        minConnections = connCount;
        selected = instance;
      }
    }

    if (selected) {
      this.connections.set(selected.id, (this.connections.get(selected.id) || 0) + 1);
    }

    return selected;
  }

  release(id: string): void {
    const current = this.connections.get(id) || 1;
    if (current > 0) {
      this.connections.set(id, current - 1);
    }
  }
}

export class ServiceDiscovery extends EventEmitter {
  private registry: ServiceRegistry;
  private config: DiscoveryConfig;
  private refreshIntervalId?: NodeJS.Timeout;
  private healthCheckIntervalId?: NodeJS.Timeout;
  private reconnectAttempts: Map<string, number> = new Map();

  constructor(
    registry: ServiceRegistry,
    config: Partial<DiscoveryConfig> = {}
  ) {
    super();
    this.registry = registry;
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
  }

  start(): void {
    if (this.refreshIntervalId) {
      return;
    }

    this.refreshIntervalId = setInterval(() => {
      this.refreshServices();
    }, this.config.refreshIntervalMs);

    this.healthCheckIntervalId = setInterval(() => {
      this.healthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  stop(): void {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = undefined;
    }

    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = undefined;
    }
  }

  async addService(endpoint: ServiceEndpoint): Promise<void> {
    const instance: ServiceInstance = {
      id: endpoint.id,
      endpoint,
      state: "disconnected",
      errorCount: 0,
      healthScore: 1.0,
    };

    this.registry.register(instance);
    await this.connect(instance.id);
  }

  async removeService(id: string): Promise<void> {
    await this.disconnect(id);
    this.registry.unregister(id);
  }

  async connect(id: string): Promise<boolean> {
    const instance = this.registry.get(id);
    if (!instance) {
      return false;
    }

    this.registry.updateState(id, "connecting");

    try {
      const connected = await this.attemptConnection(instance);

      if (connected) {
        this.registry.updateState(id, "connected");
        this.reconnectAttempts.delete(id);
        this.emit("connected", instance);
        return true;
      } else {
        throw new Error("Connection failed");
      }
    } catch (error) {
      return this.handleConnectionError(id, error as Error);
    }
  }

  private async attemptConnection(instance: ServiceInstance): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true);
      }, 100);
    });
  }

  private async handleConnectionError(id: string, error: Error): Promise<boolean> {
    const attempts = (this.reconnectAttempts.get(id) || 0) + 1;
    this.reconnectAttempts.set(id, attempts);

    if (attempts >= this.config.maxReconnectAttempts) {
      this.registry.updateState(id, "error", error.message);
      this.emit("error", { id, error, attempts });
      return false;
    }

    this.registry.updateState(id, "reconnecting", error.message);

    const delay = Math.min(
      this.config.reconnectBaseDelayMs * Math.pow(2, attempts - 1),
      this.config.reconnectMaxDelayMs
    );

    this.emit("reconnecting", { id, attempts, delay });

    await new Promise((resolve) => setTimeout(resolve, delay));

    return this.connect(id);
  }

  async disconnect(id: string): Promise<void> {
    this.reconnectAttempts.delete(id);
    this.registry.updateState(id, "disconnected");
    this.emit("disconnected", { id });
  }

  private async refreshServices(): Promise<void> {
    const instances = this.registry.getAll();

    for (const instance of instances) {
      if (instance.state === "disconnected" || instance.state === "error") {
        this.connect(instance.id);
      }
    }

    this.emit("refresh", instances);
  }

  private async healthCheck(): Promise<void> {
    const instances = this.registry.getAll();

    for (const instance of instances) {
      if (instance.state !== "connected") {
        continue;
      }

      try {
        const healthy = await this.performHealthCheck(instance);

        if (healthy) {
          instance.healthScore = Math.min(1, instance.healthScore + 0.1);
        } else {
          instance.healthScore = Math.max(0, instance.healthScore - 0.2);
        }

        if (instance.healthScore < 0.3) {
          this.connect(instance.id);
        }
      } catch (error) {
        instance.healthScore = Math.max(0, instance.healthScore - 0.3);
        if (instance.healthScore < 0.3) {
          this.connect(instance.id);
        }
      }
    }
  }

  private async performHealthCheck(instance: ServiceInstance): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(Math.random() > 0.1);
      }, this.config.healthCheckTimeoutMs);
    });
  }

  getRegistry(): ServiceRegistry {
    return this.registry;
  }

  getStats(): {
    total: number;
    connected: number;
    disconnected: number;
    reconnecting: number;
    error: number;
    averageHealth: number;
  } {
    const instances = this.registry.getAll();
    const connected = instances.filter((i) => i.state === "connected").length;
    const disconnected = instances.filter((i) => i.state === "disconnected").length;
    const reconnecting = instances.filter((i) => i.state === "reconnecting").length;
    const error = instances.filter((i) => i.state === "error").length;
    const averageHealth =
      instances.length > 0
        ? instances.reduce((sum, i) => sum + i.healthScore, 0) / instances.length
        : 0;

    return {
      total: instances.length,
      connected,
      disconnected,
      reconnecting,
      error,
      averageHealth,
    };
  }
}

export class ReconnectionManager {
  private config: DiscoveryConfig;
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: Map<string, () => Promise<boolean>> = new Map();

  constructor(config: Partial<DiscoveryConfig> = {}) {
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
  }

  scheduleReconnect(
    id: string,
    attempt: number,
    callback: () => Promise<boolean>
  ): void {
    this.cancelReconnect(id);

    const delay = Math.min(
      this.config.reconnectBaseDelayMs * Math.pow(2, attempt - 1),
      this.config.reconnectMaxDelayMs
    );

    this.callbacks.set(id, callback);

    const timer = setTimeout(async () => {
      try {
        const success = await callback();
        if (success) {
          this.callbacks.delete(id);
        }
      } catch (e) {
        console.error(`Reconnect failed for ${id}:`, e);
      }
    }, delay);

    this.timers.set(id, timer);
  }

  cancelReconnect(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.callbacks.delete(id);
  }

  isScheduled(id: string): boolean {
    return this.timers.has(id);
  }

  getScheduledIds(): string[] {
    return Array.from(this.timers.keys());
  }
}

export const defaultServiceRegistry = new DefaultServiceRegistry();
export const defaultServiceDiscovery = new ServiceDiscovery(defaultServiceRegistry);
export const defaultReconnectionManager = new ReconnectionManager();
