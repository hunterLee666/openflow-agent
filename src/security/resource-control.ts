export type NetworkPolicy = "allow" | "deny" | "prompt";
export type ResourceType = "cpu" | "memory" | "disk" | "processes";

export interface ResourceLimit {
  type: ResourceType;
  limit: number;
  unit: string;
  soft?: number;
  hard?: number;
  action?: "kill" | "warn" | "throttle";
}

export interface NetworkRule {
  pattern: string;
  port?: number;
  host?: string;
  policy: NetworkPolicy;
  description?: string;
}

export interface ResourceMonitorConfig {
  enabled: boolean;
  checkIntervalMs: number;
  thresholds: {
    cpu?: number;
    memory?: number;
    disk?: number;
    processes?: number;
  };
  onThresholdExceeded?: (resource: ResourceType, current: number, limit: number) => void;
}

export class ResourceMonitor {
  private usage: Map<ResourceType, number> = new Map();
  private limits: ResourceLimit[] = [];
  private config: ResourceMonitorConfig;
  private intervalId?: NodeJS.Timeout;
  private listeners: Map<ResourceType, Array<(current: number) => void>> = new Map();

  constructor(config: Partial<ResourceMonitorConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      checkIntervalMs: config.checkIntervalMs ?? 1000,
      thresholds: config.thresholds ?? {},
      ...config,
    };
  }

  start(): void {
    if (this.intervalId) {
      return;
    }

    this.intervalId = setInterval(() => {
      this.collectMetrics();
      this.checkThresholds();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  setLimit(limit: ResourceLimit): void {
    const existingIndex = this.limits.findIndex(l => l.type === limit.type);
    if (existingIndex !== -1) {
      this.limits[existingIndex] = limit;
    } else {
      this.limits.push(limit);
    }
  }

  removeLimit(type: ResourceType): void {
    this.limits = this.limits.filter(l => l.type !== type);
  }

  getUsage(type: ResourceType): number {
    return this.usage.get(type) || 0;
  }

  getAllUsage(): Record<ResourceType, number> {
    return Object.fromEntries(this.usage) as Record<ResourceType, number>;
  }

  onUsageChange(type: ResourceType, listener: (current: number) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);

    return () => {
      const typeListeners = this.listeners.get(type);
      if (typeListeners) {
        const index = typeListeners.indexOf(listener);
        if (index !== -1) {
          typeListeners.splice(index, 1);
        }
      }
    };
  }

  private collectMetrics(): void {
    this.usage.set("cpu", this.getCpuUsage());
    this.usage.set("memory", this.getMemoryUsage());
    this.usage.set("disk", this.getDiskUsage());
    this.usage.set("processes", this.getProcessCount());
  }

  private getCpuUsage(): number {
    if (process.platform === "linux") {
      try {
        const { execSync } = require("child_process");
        const stat = execSync("cat /proc/stat | head -1", { encoding: "utf-8" });
        const parts = stat.trim().split(/\s+/);
        const total = parts.slice(1).reduce((acc: number, v: string) => acc + parseInt(v, 10), 0);
        const idle = parseInt(parts[4], 10);
        return total > 0 ? ((total - idle) / total) * 100 : 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  private getMemoryUsage(): number {
    if (process.platform === "linux") {
      try {
        const { execSync } = require("child_process");
        const meminfo = execSync("cat /proc/meminfo", { encoding: "utf-8" });
        const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
        const availableMatch = meminfo.match(/MemAvailable:\s+(\d+)/);

        if (totalMatch && availableMatch) {
          const total = parseInt(totalMatch[1], 10);
          const available = parseInt(availableMatch[1], 10);
          return ((total - available) / total) * 100;
        }
      } catch {
        // Fall through
      }
    }

    if (process.platform === "darwin") {
      try {
        const { execSync } = require("child_process");
        const output = execSync("vm_stat", { encoding: "utf-8" });
        const pagesMatch = output.match(/Pages active:\s+(\d+)/);
        const wiredMatch = output.match(/Pages wired down:\s+(\d+)/);

        if (pagesMatch) {
          const active = parseInt(pagesMatch[1], 10);
          const wired = wiredMatch ? parseInt(wiredMatch[1], 10) : 0;
          const pageSize = 4096;
          const usedMemoryMB = (active + wired) * pageSize / (1024 * 1024);
          return Math.min(100, usedMemoryMB / 8192 * 100);
        }
      } catch {
        // Fall through
      }
    }

    return 0;
  }

  private getDiskUsage(): number {
    try {
      const { execSync } = require("child_process");

      if (process.platform === "linux") {
        const df = execSync("df -h /", { encoding: "utf-8" });
        const lines = df.trim().split("\n");
        if (lines.length >= 2) {
          const parts = lines[1].split(/\s+/);
          const usePercent = parseInt(parts[4]?.replace("%", "") || "0", 10);
          return usePercent;
        }
      } else if (process.platform === "darwin") {
        const df = execSync("df -h /", { encoding: "utf-8" });
        const lines = df.trim().split("\n");
        if (lines.length >= 2) {
          const parts = lines[1].split(/\s+/);
          const usePercent = parseInt(parts[4]?.replace("%", "") || "0", 10);
          return usePercent;
        }
      }
    } catch {
      // Fall through
    }
    return 0;
  }

  private getProcessCount(): number {
    try {
      const { execSync } = require("child_process");

      if (process.platform === "linux") {
        const pids = execSync("ls /proc | grep -E '^\\d+$'", { encoding: "utf-8" });
        return pids.trim().split("\n").length;
      } else if (process.platform === "darwin") {
        const ps = execSync("ps aux | wc -l", { encoding: "utf-8" });
        return parseInt(ps.trim(), 10);
      }
    } catch {
      // Fall through
    }
    return 0;
  }

  private checkThresholds(): void {
    for (const [type, current] of this.usage) {
      const threshold = this.config.thresholds[type];
      if (threshold && current > threshold) {
        this.config.onThresholdExceeded?.(type, current, threshold);

        const limit = this.limits.find(l => l.type === type);
        if (limit && limit.action === "kill") {
          this.handleLimitExceeded(type, current, limit);
        }
      }

      const typeListeners = this.listeners.get(type);
      if (typeListeners) {
        for (const listener of typeListeners) {
          listener(current);
        }
      }
    }
  }

  private handleLimitExceeded(type: ResourceType, current: number, limit: ResourceLimit): void {
    console.error(`Resource limit exceeded: ${type} at ${current}${limit.unit} (limit: ${limit.limit}${limit.unit})`);

    if (limit.action === "throttle") {
      const delay = Math.ceil((current - limit.limit) / limit.limit * 100);
      setTimeout(() => {}, delay);
    }
  }

  getStats(): { usage: Record<ResourceType, number>; limits: ResourceLimit[] } {
    return {
      usage: this.getAllUsage(),
      limits: [...this.limits],
    };
  }
}

export class NetworkController {
  private rules: NetworkRule[] = [];
  private allowedHosts: Set<string> = new Set();
  private blockedHosts: Set<string> = new Set();
  private defaultPolicy: NetworkPolicy = "prompt";

  constructor(rules: NetworkRule[] = []) {
    this.rules = rules;
  }

  addRule(rule: NetworkRule): void {
    this.rules.push(rule);
  }

  removeRule(pattern: string): void {
    this.rules = this.rules.filter(r => r.pattern !== pattern);
  }

  setDefaultPolicy(policy: NetworkPolicy): void {
    this.defaultPolicy = policy;
  }

  checkAccess(host: string, port?: number): { allowed: boolean; reason?: string } {
    for (const rule of this.rules) {
      if (this.ruleMatches(rule, host, port)) {
        if (rule.policy === "deny") {
          return { allowed: false, reason: rule.description || `Blocked by rule: ${rule.pattern}` };
        }
        if (rule.policy === "allow") {
          return { allowed: true, reason: rule.description || `Allowed by rule: ${rule.pattern}` };
        }
      }
    }

    if (this.blockedHosts.has(host)) {
      return { allowed: false, reason: "Host is explicitly blocked" };
    }

    if (this.allowedHosts.size > 0 && !this.allowedHosts.has(host)) {
      return { allowed: false, reason: "Host is not in allowed list" };
    }

    if (this.defaultPolicy === "prompt") {
      return { allowed: true, reason: "Default allow with prompt" };
    }

    if (this.defaultPolicy === "deny") {
      return { allowed: false, reason: "Default deny policy" };
    }

    return { allowed: true };
  }

  private ruleMatches(rule: NetworkRule, host: string, port?: number): boolean {
    if (rule.host && rule.host !== host) {
      return false;
    }

    if (rule.port && rule.port !== port) {
      return false;
    }

    if (rule.pattern === "*") {
      return true;
    }

    if (rule.pattern.includes("*")) {
      const regex = new RegExp("^" + rule.pattern.replace(/\*/g, ".*") + "$");
      return regex.test(host);
    }

    return rule.pattern === host || host.endsWith("." + rule.pattern);
  }

  allowHost(host: string): void {
    this.allowedHosts.add(host);
    this.blockedHosts.delete(host);
  }

  blockHost(host: string): void {
    this.blockedHosts.add(host);
    this.allowedHosts.delete(host);
  }

  getAllowedHosts(): string[] {
    return Array.from(this.allowedHosts);
  }

  getBlockedHosts(): string[] {
    return Array.from(this.blockedHosts);
  }

  getRules(): NetworkRule[] {
    return [...this.rules];
  }
}

export interface SecurityPolicy {
  networkController: NetworkController;
  resourceMonitor: ResourceMonitor;
  allowedPaths: string[];
  deniedPaths: string[];
  maxExecutionTimeMs: number;
  maxOutputSize: number;
}

export class SecurityPolicyManager {
  private policies: Map<string, SecurityPolicy> = new Map();
  private activePolicy?: string;

  registerPolicy(name: string, policy: SecurityPolicy): void {
    this.policies.set(name, policy);
  }

  unregisterPolicy(name: string): void {
    this.policies.delete(name);
    if (this.activePolicy === name) {
      this.activePolicy = undefined;
    }
  }

  setActivePolicy(name: string): boolean {
    if (this.policies.has(name)) {
      this.activePolicy = name;
      const policy = this.policies.get(name)!;
      policy.resourceMonitor.start();
      return true;
    }
    return false;
  }

  getActivePolicy(): SecurityPolicy | undefined {
    if (this.activePolicy) {
      return this.policies.get(this.activePolicy);
    }
    return undefined;
  }

  getPolicy(name: string): SecurityPolicy | undefined {
    return this.policies.get(name);
  }

  validateCommand(command: string, args?: Record<string, unknown>): { valid: boolean; reason?: string } {
    const policy = this.getActivePolicy();
    if (!policy) {
      return { valid: true };
    }

    if (policy.maxExecutionTimeMs <= 0) {
      return { valid: false, reason: "Execution time limit exceeded" };
    }

    return { valid: true };
  }

  checkNetworkAccess(host: string, port?: number): { allowed: boolean; reason?: string } {
    const policy = this.getActivePolicy();
    if (!policy) {
      return { allowed: true };
    }

    return policy.networkController.checkAccess(host, port);
  }

  getResourceStats(): Record<ResourceType, number> | undefined {
    const policy = this.getActivePolicy();
    if (!policy) {
      return undefined;
    }

    return policy.resourceMonitor.getAllUsage();
  }
}

export const defaultNetworkController = new NetworkController([
  { pattern: "localhost", policy: "allow", description: "Localhost access" },
  { pattern: "127.0.0.1", policy: "allow", description: "Localhost access" },
  { pattern: "*.local", policy: "allow", description: "Local network access" },
]);

export const defaultResourceMonitor = new ResourceMonitor({
  enabled: true,
  checkIntervalMs: 2000,
  thresholds: {
    cpu: 90,
    memory: 85,
    disk: 90,
    processes: 500,
  },
});

export const defaultSecurityPolicyManager = new SecurityPolicyManager();
