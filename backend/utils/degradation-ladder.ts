import { z } from "zod";

export const DegradationLevelSchema = z.object({
  level: z.number(),
  name: z.string(),
  description: z.string(),
  features: z.array(z.string()),
  disabledFeatures: z.array(z.string()),
  triggers: z.array(z.string()),
  recoveryCondition: z.string().optional(),
});

export type DegradationLevel = z.infer<typeof DegradationLevelSchema>;

export const DegradationConfigSchema = z.object({
  levels: z.array(DegradationLevelSchema),
  autoRecovery: z.boolean(),
  recoveryCheckIntervalMs: z.number().optional(),
  onDegradation: z.function().args(z.number(), z.number()).returns(z.void()).optional(),
  onRecovery: z.function().args(z.number(), z.number()).returns(z.void()).optional(),
});

export type DegradationConfig = z.infer<typeof DegradationConfigSchema>;

export const DEFAULT_DEGRADATION_LEVELS: DegradationLevel[] = [
  {
    level: 0,
    name: "Full Service",
    description: "所有功能正常运行",
    features: [
      "full_context",
      "tool_execution",
      "agent_delegation",
      "memory_consolidation",
      "compaction",
      "streaming",
    ],
    disabledFeatures: [],
    triggers: [],
  },
  {
    level: 1,
    name: "Reduced Context",
    description: "减少上下文窗口，保留核心功能",
    features: ["tool_execution", "agent_delegation", "compaction", "streaming"],
    disabledFeatures: ["full_context", "memory_consolidation"],
    triggers: ["context_window_exceeded", "high_memory_usage"],
    recoveryCondition: "memory_usage < 70%",
  },
  {
    level: 2,
    name: "Basic Operations",
    description: "仅保留基础操作，禁用高级功能",
    features: ["tool_execution", "compaction"],
    disabledFeatures: ["full_context", "agent_delegation", "memory_consolidation", "streaming"],
    triggers: ["repeated_compaction_failures", "api_rate_limit"],
    recoveryCondition: "error_rate < 10% for 5 minutes",
  },
  {
    level: 3,
    name: "Safe Mode",
    description: "安全模式，仅支持只读操作",
    features: ["compaction"],
    disabledFeatures: [
      "full_context",
      "tool_execution",
      "agent_delegation",
      "memory_consolidation",
      "streaming",
    ],
    triggers: ["circuit_breaker_open", "critical_error"],
    recoveryCondition: "manual_reset or system_restart",
  },
];

export class DegradationLadder {
  private currentLevel = 0;
  private config: DegradationConfig;
  private errorCounts: Map<string, number> = new Map();
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Array<(level: number, previousLevel: number) => void> = [];

  constructor(config?: Partial<DegradationConfig>) {
    this.config = {
      levels: config?.levels || DEFAULT_DEGRADATION_LEVELS,
      autoRecovery: config?.autoRecovery ?? true,
      recoveryCheckIntervalMs: config?.recoveryCheckIntervalMs || 30000,
      onDegradation: config?.onDegradation,
      onRecovery: config?.onRecovery,
    };

    if (this.config.autoRecovery) {
      this.startRecoveryChecker();
    }
  }

  getCurrentLevel(): number {
    return this.currentLevel;
  }

  getCurrentLevelConfig(): DegradationLevel {
    return this.config.levels[this.currentLevel];
  }

  isFeatureEnabled(feature: string): boolean {
    const currentLevelConfig = this.getCurrentLevelConfig();
    return currentLevelConfig.features.includes(feature);
  }

  getDisabledFeatures(): string[] {
    return this.getCurrentLevelConfig().disabledFeatures;
  }

  degrade(reason: string): void {
    const previousLevel = this.currentLevel;
    const errorCount = (this.errorCounts.get(reason) || 0) + 1;
    this.errorCounts.set(reason, errorCount);

    const targetLevel = this.calculateTargetLevel(reason, errorCount);

    if (targetLevel > this.currentLevel) {
      this.currentLevel = targetLevel;
      this.config.onDegradation?.(this.currentLevel, previousLevel);

      for (const listener of this.listeners) {
        listener(this.currentLevel, previousLevel);
      }
    }
  }

  recover(): void {
    if (this.currentLevel === 0) return;

    const previousLevel = this.currentLevel;
    this.currentLevel = Math.max(0, this.currentLevel - 1);

    if (this.currentLevel < previousLevel) {
      this.config.onRecovery?.(this.currentLevel, previousLevel);

      for (const listener of this.listeners) {
        listener(this.currentLevel, previousLevel);
      }
    }
  }

  reset(): void {
    const previousLevel = this.currentLevel;
    this.currentLevel = 0;
    this.errorCounts.clear();

    if (previousLevel > 0) {
      this.config.onRecovery?.(0, previousLevel);

      for (const listener of this.listeners) {
        listener(0, previousLevel);
      }
    }
  }

  onLevelChange(listener: (level: number, previousLevel: number) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getStatus(): {
    level: number;
    name: string;
    description: string;
    enabledFeatures: string[];
    disabledFeatures: string[];
    errorCounts: Map<string, number>;
  } {
    const levelConfig = this.getCurrentLevelConfig();
    return {
      level: this.currentLevel,
      name: levelConfig.name,
      description: levelConfig.description,
      enabledFeatures: levelConfig.features,
      disabledFeatures: levelConfig.disabledFeatures,
      errorCounts: new Map(this.errorCounts),
    };
  }

  shutdown(): void {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  private calculateTargetLevel(reason: string, errorCount: number): number {
    for (let i = this.config.levels.length - 1; i >= 0; i--) {
      const level = this.config.levels[i];
      if (level.triggers.includes(reason) && errorCount >= 1) {
        return i;
      }
    }

    if (errorCount >= 5) return 3;
    if (errorCount >= 3) return 2;
    if (errorCount >= 2) return 1;

    return this.currentLevel;
  }

  private startRecoveryChecker(): void {
    this.recoveryTimer = setInterval(() => {
      if (this.currentLevel > 0) {
        const currentLevelConfig = this.getCurrentLevelConfig();
        if (currentLevelConfig.recoveryCondition) {
          const shouldRecover = this.checkRecoveryCondition(currentLevelConfig.recoveryCondition);
          if (shouldRecover) {
            this.recover();
          }
        }
      }
    }, this.config.recoveryCheckIntervalMs);
  }

  private checkRecoveryCondition(_condition: string): boolean {
    return true;
  }
}
