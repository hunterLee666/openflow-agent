export interface ProceduralMemoryEntry {
  id: string;
  skillName: string;
  description: string;
  steps: ProceduralStep[];
  successCount: number;
  failureCount: number;
  lastUsedAt: number;
  createdAt: number;
  version: number;
  confidence: number;
}

export interface ProceduralStep {
  order: number;
  action: string;
  parameters?: Record<string, unknown>;
  expectedOutput?: string;
  tools?: string[];
}

export interface SkillExecutionRecord {
  skillName: string;
  success: boolean;
  duration: number;
  timestamp: number;
  feedback?: string;
}

export class ProceduralMemory {
  private skills: Map<string, ProceduralMemoryEntry>;
  private executionHistory: SkillExecutionRecord[];
  private maxHistorySize: number;

  constructor(maxHistorySize = 500) {
    this.skills = new Map();
    this.executionHistory = [];
    this.maxHistorySize = maxHistorySize;
  }

  async learnSkill(entry: Omit<ProceduralMemoryEntry, "successCount" | "failureCount" | "lastUsedAt" | "createdAt" | "version" | "confidence">): Promise<void> {
    const fullEntry: ProceduralMemoryEntry = {
      ...entry,
      successCount: 0,
      failureCount: 0,
      lastUsedAt: 0,
      createdAt: Date.now(),
      version: 1,
      confidence: 0.5,
    };

    this.skills.set(entry.id, fullEntry);
  }

  async recordExecution(record: SkillExecutionRecord): Promise<void> {
    this.executionHistory.push(record);

    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }

    const skill = this.skills.get(record.skillName);
    if (skill) {
      skill.lastUsedAt = record.timestamp;

      if (record.success) {
        skill.successCount++;
      } else {
        skill.failureCount++;
      }

      skill.confidence = this.calculateConfidence(skill);
    }
  }

  async getSkill(skillName: string): Promise<ProceduralMemoryEntry | null> {
    return this.skills.get(skillName) || null;
  }

  async getTopSkills(limit = 10): Promise<ProceduralMemoryEntry[]> {
    const skills = Array.from(this.skills.values());

    skills.sort((a, b) => {
      const confidenceDiff = b.confidence - a.confidence;
      if (confidenceDiff !== 0) return confidenceDiff;
      return b.successCount - a.successCount;
    });

    return skills.slice(0, limit);
  }

  async getSkillsByConfidence(minConfidence: number): Promise<ProceduralMemoryEntry[]> {
    const results: ProceduralMemoryEntry[] = [];

    for (const skill of this.skills.values()) {
      if (skill.confidence >= minConfidence) {
        results.push(skill);
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  async updateSkill(skillId: string, updates: Partial<ProceduralMemoryEntry>): Promise<boolean> {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    if (updates.steps) {
      skill.steps = updates.steps;
      skill.version++;
    }

    if (updates.description) {
      skill.description = updates.description;
    }

    return true;
  }

  async deleteSkill(skillId: string): Promise<boolean> {
    return this.skills.delete(skillId);
  }

  getExecutionHistory(skillName?: string, limit = 50): SkillExecutionRecord[] {
    let history = this.executionHistory;

    if (skillName) {
      history = history.filter((r) => r.skillName === skillName);
    }

    return history.slice(-limit);
  }

  getSkillStats(skillName: string): { successRate: number; avgDuration: number; totalExecutions: number } | null {
    const skill = this.skills.get(skillName);
    if (!skill) return null;

    const totalExecutions = skill.successCount + skill.failureCount;
    const successRate = totalExecutions > 0 ? skill.successCount / totalExecutions : 0;

    const history = this.executionHistory.filter((r) => r.skillName === skillName);
    const avgDuration = history.length > 0 ? history.reduce((sum, r) => sum + r.duration, 0) / history.length : 0;

    return {
      successRate,
      avgDuration,
      totalExecutions,
    };
  }

  private calculateConfidence(skill: ProceduralMemoryEntry): number {
    const totalExecutions = skill.successCount + skill.failureCount;

    if (totalExecutions === 0) {
      return 0.5;
    }

    const successRate = skill.successCount / totalExecutions;

    const executionWeight = Math.min(totalExecutions / 10, 1);

    const recencyBonus = this.calculateRecencyBonus(skill.lastUsedAt);

    const baseConfidence = successRate * 0.6 + executionWeight * 0.3 + recencyBonus * 0.1;

    return Math.min(Math.max(baseConfidence, 0), 1);
  }

  private calculateRecencyBonus(lastUsedAt: number): number {
    if (lastUsedAt === 0) return 0;

    const daysSinceLastUse = (Date.now() - lastUsedAt) / (1000 * 60 * 60 * 24);

    if (daysSinceLastUse < 1) return 1;
    if (daysSinceLastUse < 7) return 0.8;
    if (daysSinceLastUse < 30) return 0.5;
    return 0.2;
  }

  async clear(): Promise<void> {
    this.skills.clear();
    this.executionHistory = [];
  }

  size(): number {
    return this.skills.size;
  }

  getStats(): { totalSkills: number; avgConfidence: number; totalExecutions: number } {
    let totalConfidence = 0;
    let totalExecutions = 0;

    for (const skill of this.skills.values()) {
      totalConfidence += skill.confidence;
      totalExecutions += skill.successCount + skill.failureCount;
    }

    return {
      totalSkills: this.skills.size,
      avgConfidence: this.skills.size > 0 ? totalConfidence / this.skills.size : 0,
      totalExecutions,
    };
  }
}
