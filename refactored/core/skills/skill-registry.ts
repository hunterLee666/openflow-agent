import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  trigger?: string[];
  metadata?: Record<string, unknown>;
  agentskillsIo?: {
    name: string;
    version: string;
    description: string;
    triggers?: string[];
  };
}

export interface SkillDefinition {
  manifest: SkillManifest;
  content: string;
  path: string;
  isMarkdown: boolean;
  metadata: Record<string, unknown>;
}

export interface SkillRegistryEntry {
  skill: SkillDefinition;
  enabled: boolean;
  loadedAt: number;
  lastUsed?: number;
  usageCount: number;
}

export const SKILL_FILE_NAMES = [
  "SKILL.md",
  "skill.md",
  "SKILL.mdx",
  "skill.mdx",
  "SKILL.txt",
  "skill.txt",
];

export const SKILL_DIR_NAMES = [
  ".openflow-skills",
  ".openflow/skills",
  "openflow-skills",
  ".skills",
  "skills",
];

export class SkillRegistry {
  private skills: Map<string, SkillRegistryEntry> = new Map();
  private disclosureLevel: "minimal" | "basic" | "full" = "minimal";

  setDisclosureLevel(level: "minimal" | "basic" | "full"): void {
    this.disclosureLevel = level;
  }

  async discoverSkills(basePath: string): Promise<SkillDefinition[]> {
    const skills: SkillDefinition[] = [];

    for (const dirName of SKILL_DIR_NAMES) {
      const dirPath = join(basePath, dirName);
      const exists = await this.pathExists(dirPath);
      if (!exists) continue;

      const dirSkills = await this.scanSkillDirectory(dirPath);
      skills.push(...dirSkills);
    }

    return skills;
  }

  async registerSkill(skill: SkillDefinition): Promise<void> {
    const name = skill.manifest.name;

    if (this.skills.has(name)) {
      const existing = this.skills.get(name)!;
      existing.skill = skill;
      return;
    }

    this.skills.set(name, {
      skill,
      enabled: true,
      loadedAt: Date.now(),
      usageCount: 0,
    });
  }

  async loadSkillFromPath(skillPath: string): Promise<SkillDefinition | null> {
    const skillFile = await this.findSkillFile(skillPath);
    if (!skillFile) return null;

    const content = await readFile(skillFile, "utf-8");
    const manifest = this.parseSkillManifest(content, skillFile);

    return {
      manifest,
      content,
      path: skillFile,
      isMarkdown: skillFile.endsWith(".md") || skillFile.endsWith(".mdx"),
      metadata: {},
    };
  }

  getSkill(name: string): SkillDefinition | null {
    const entry = this.skills.get(name);
    return entry?.skill || null;
  }

  getSkillsForTrigger(trigger: string): SkillDefinition[] {
    const lowerTrigger = trigger.toLowerCase();
    const matching: SkillDefinition[] = [];

    for (const [, entry] of this.skills.entries()) {
      if (!entry.enabled) continue;

      const triggers = entry.skill.manifest.trigger || [];
      const agentskillsTriggers = entry.skill.manifest.agentskillsIo?.triggers || [];
      const allTriggers = [...triggers, ...agentskillsTriggers];

      for (const t of allTriggers) {
        if (lowerTrigger.includes(t.toLowerCase())) {
          matching.push(entry.skill);
          break;
        }
      }
    }

    return matching;
  }

  getProgressiveDisclosureContent(skillName: string): string {
    const entry = this.skills.get(skillName);
    if (!entry) return "";

    const skill = entry.skill;

    switch (this.disclosureLevel) {
      case "minimal":
        return `Skill: ${skill.manifest.name}\nDescription: ${skill.manifest.description}`;

      case "basic":
        return `Skill: ${skill.manifest.name}\nDescription: ${skill.manifest.description}\nVersion: ${skill.manifest.version}\nTriggers: ${(skill.manifest.trigger || []).join(", ")}`;

      case "full":
        return skill.content;

      default:
        return skill.content;
    }
  }

  getAllSkills(): SkillDefinition[] {
    const result: SkillDefinition[] = [];
    for (const [, entry] of this.skills.entries()) {
      if (entry.enabled) {
        result.push(entry.skill);
      }
    }
    return result;
  }

  enableSkill(name: string): void {
    const entry = this.skills.get(name);
    if (entry) {
      entry.enabled = true;
    }
  }

  disableSkill(name: string): void {
    const entry = this.skills.get(name);
    if (entry) {
      entry.enabled = false;
    }
  }

  recordUsage(name: string): void {
    const entry = this.skills.get(name);
    if (entry) {
      entry.lastUsed = Date.now();
      entry.usageCount++;
    }
  }

  getUsageStats(): Array<{ name: string; usageCount: number; lastUsed?: number }> {
    const stats: Array<{ name: string; usageCount: number; lastUsed?: number }> = [];
    for (const [name, entry] of this.skills.entries()) {
      stats.push({
        name,
        usageCount: entry.usageCount,
        lastUsed: entry.lastUsed,
      });
    }
    return stats.sort((a, b) => b.usageCount - a.usageCount);
  }

  private async scanSkillDirectory(dirPath: string): Promise<SkillDefinition[]> {
    const skills: SkillDefinition[] = [];
    const entries = await readdir(dirPath);

    for (const entry of entries) {
      const entryPath = join(dirPath, entry);
      const entryStat = await stat(entryPath).catch(() => null);

      if (entryStat?.isDirectory()) {
        const skill = await this.loadSkillFromPath(entryPath);
        if (skill) {
          skills.push(skill);
          await this.registerSkill(skill);
        }
      } else if (SKILL_FILE_NAMES.some((name) => entry.toLowerCase() === name.toLowerCase())) {
        const content = await readFile(entryPath, "utf-8");
        const manifest = this.parseSkillManifest(content, entryPath);

        const skill: SkillDefinition = {
          manifest,
          content,
          path: entryPath,
          isMarkdown: entryPath.endsWith(".md") || entryPath.endsWith(".mdx"),
          metadata: {},
        };

        skills.push(skill);
        await this.registerSkill(skill);
      }
    }

    return skills;
  }

  private async findSkillFile(skillPath: string): Promise<string | null> {
    const exists = await this.pathExists(skillPath);

    if (exists) {
      const skillStat = await stat(skillPath);
      if (skillStat.isFile()) {
        return skillPath;
      }

      if (skillStat.isDirectory()) {
        for (const fileName of SKILL_FILE_NAMES) {
          const filePath = join(skillPath, fileName);
          const fileExists = await this.pathExists(filePath);
          if (fileExists) {
            return filePath;
          }
        }
      }
    }

    return null;
  }

  private parseSkillManifest(content: string, path: string): SkillManifest {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      const versionMatch = frontmatter.match(/version:\s*(.+)/);
      const descriptionMatch = frontmatter.match(/description:\s*(.+)/);
      const triggerMatch = frontmatter.match(/trigger:\s*\[([^\]]*)\]/);

      return {
        name: nameMatch?.[1]?.trim() || dirname(path).split("/").pop() || "unknown",
        version: versionMatch?.[1]?.trim() || "1.0.0",
        description: descriptionMatch?.[1]?.trim() || "",
        trigger: triggerMatch?.[1]?.split(",").map((t) => t.trim()) || [],
      };
    }

    const firstLine = content.split("\n")[0];
    const nameMatch = firstLine.match(/^#\s+(.+)/);

    return {
      name: nameMatch?.[1]?.trim() || dirname(path).split("/").pop() || "unknown",
      version: "1.0.0",
      description: firstLine.replace(/^#\s+/, "").slice(0, 100),
      trigger: [],
    };
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}

export function createAgentskillsIoCompatibleManifest(
  name: string,
  version: string,
  description: string,
  triggers?: string[]
): SkillManifest {
  return {
    name,
    version,
    description,
    trigger: triggers,
    agentskillsIo: {
      name,
      version,
      description,
      triggers,
    },
  };
}
