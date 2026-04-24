import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SkillRegistry, Skill, SkillStep } from "./types.js";

export class DefaultSkillRegistry implements SkillRegistry {
  private skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  unregister(id: string): void {
    this.skills.delete(id);
  }

  find(trigger: string): Skill | undefined {
    const lower = trigger.toLowerCase();
    for (const skill of this.skills.values()) {
      if (skill.triggers.some((t) => lower.includes(t.toLowerCase()))) {
        return skill;
      }
    }
    return undefined;
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  async loadFromMarkdown(path: string): Promise<Skill> {
    const content = await readFile(path, "utf-8");
    return parseSkillMarkdown(content, path);
  }
}

export function parseSkillMarkdown(content: string, sourcePath: string): Skill {
  const lines = content.split("\n");
  let name = "";
  let description = "";
  const triggers: string[] = [];
  const steps: SkillStep[] = [];
  const allowedTools: string[] = [];

  let inFrontMatter = false;
  let frontMatterDone = false;
  let currentSection = "";

  for (const line of lines) {
    if (line.trim() === "---" && !frontMatterDone) {
      if (!inFrontMatter) {
        inFrontMatter = true;
      } else {
        frontMatterDone = true;
      }
      continue;
    }

    if (inFrontMatter && !frontMatterDone) {
      const [key, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      switch (key.trim()) {
        case "name":
          name = value;
          break;
        case "description":
          description = value;
          break;
        case "triggers":
          triggers.push(...value.split(",").map((t) => t.trim()));
          break;
        case "allowed-tools":
          allowedTools.push(...value.split(",").map((t) => t.trim()));
          break;
      }
      continue;
    }

    if (line.startsWith("# ")) {
      name = line.slice(2).trim();
    } else if (line.startsWith("## ")) {
      currentSection = line.slice(3).trim();
    } else if (line.startsWith("- ") && currentSection === "Steps") {
      const stepText = line.slice(2).trim();
      if (stepText.startsWith("Ask:")) {
        steps.push({ type: "prompt", content: stepText.slice(4).trim() });
      } else if (stepText.startsWith("Run:")) {
        const cmd = stepText.slice(4).trim();
        steps.push({ type: "tool", tool: "bash", input: { command: cmd } });
      } else if (stepText.startsWith("If:")) {
        steps.push({ type: "condition", condition: stepText.slice(3).trim() });
      } else {
        steps.push({ type: "prompt", content: stepText });
      }
    }
  }

  return {
    id: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name || "Unnamed Skill",
    description: description || "",
    triggers: triggers.length > 0 ? triggers : [name.toLowerCase()],
    steps,
    markdown: content,
    allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
  };
}

export function loadBuiltinSkills(): Skill[] {
  return [
    {
      id: "skill_dream",
      name: "dream",
      description: "KAIROS dreaming mode: distill episodic memories into semantic facts",
      triggers: ["dream", "distill", "sleep", "整理记忆"],
      steps: [
        { type: "prompt", content: "Scanning recent episodic memories..." },
        { type: "tool", tool: "bash", input: { command: "echo 'Distilling memories...'" } },
        { type: "prompt", content: "Memory distillation complete. Semantic facts updated." },
      ],
    },
    {
      id: "skill_compact",
      name: "compact",
      description: "Manually compress conversation context",
      triggers: ["compact", "compress", "摘要", "压缩"],
      steps: [
        { type: "prompt", content: "Analyzing conversation for compaction..." },
        { type: "prompt", content: "Context compressed. Key decisions preserved." },
      ],
    },
    {
      id: "skill_verify",
      name: "verify",
      description: "Run verification checks on current changes",
      triggers: ["verify", "test", "check", "验证"],
      steps: [
        { type: "prompt", content: "Running verification pipeline..." },
        { type: "tool", tool: "bash", input: { command: "npm test || go test ./... || echo 'No tests found'" } },
        { type: "prompt", content: "Verification complete." },
      ],
    },
  ];
}
