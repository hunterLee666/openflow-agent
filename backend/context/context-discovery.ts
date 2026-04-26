import { readFile, stat } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";

export interface ContextFile {
  name: string;
  path: string;
  content: string;
  type: ContextFileType;
  priority: number;
}

export type ContextFileType =
  | "instructions"
  | "rules"
  | "system-prompt"
  | "memory"
  | "custom";

export const CONTEXT_FILE_DEFS: Array<{
  name: string;
  type: ContextFileType;
  priority: number;
}> = [
  { name: ".openflow.md", type: "instructions", priority: 100 },
  { name: "AGENTS.md", type: "instructions", priority: 90 },
  { name: "SOUL.md", type: "system-prompt", priority: 80 },
  { name: ".cursorrules", type: "rules", priority: 75 },
  { name: ".windsurfrules", type: "rules", priority: 70 },
  { name: ".github/copilot-instructions.md", type: "instructions", priority: 65 },
  { name: ".openflow-memory.json", type: "memory", priority: 60 },
  { name: "GEMINI.md", type: "instructions", priority: 55 },
  { name: ".clinerules", type: "rules", priority: 50 },
];

export class ContextFileDiscovery {
  async discoverInDirectory(dirPath: string): Promise<ContextFile[]> {
    const found: ContextFile[] = [];

    for (const def of CONTEXT_FILE_DEFS) {
      const filePath = join(dirPath, def.name);
      const exists = await this.pathExists(filePath);

      if (exists) {
        try {
          const content = await readFile(filePath, "utf-8");
          found.push({
            name: def.name,
            path: filePath,
            content,
            type: def.type,
            priority: def.priority,
          });
        } catch {
          // Skip files that can't be read
        }
      }
    }

    return found.sort((a, b) => b.priority - a.priority);
  }

  async discoverUpward(startPath: string, maxDepth = 5): Promise<ContextFile[]> {
    const allFiles: ContextFile[] = [];
    let currentDir = resolve(startPath);

    for (let i = 0; i < maxDepth; i++) {
      const files = await this.discoverInDirectory(currentDir);
      allFiles.push(...files);

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }

    const seen = new Set<string>();
    const unique: ContextFile[] = [];

    for (const file of allFiles) {
      if (!seen.has(file.path)) {
        seen.add(file.path);
        unique.push(file);
      }
    }

    return unique.sort((a, b) => b.priority - a.priority);
  }

  async getContextContent(dirPath: string): Promise<string> {
    const files = await this.discoverInDirectory(dirPath);

    if (files.length === 0) return "";

    const parts: string[] = [
      "# Context Files",
      "",
      "The following context files have been discovered and are active for this session:",
      "",
    ];

    for (const file of files) {
      parts.push(`## ${file.name} (${file.type})`);
      parts.push("");
      parts.push(file.content);
      parts.push("");
    }

    return parts.join("\n");
  }

  async getContextFilesForSession(workspacePath: string): Promise<ContextFile[]> {
    const files = await this.discoverUpward(workspacePath);

    const instructions = files.filter((f) => f.type === "instructions");
    const rules = files.filter((f) => f.type === "rules");
    const systemPrompts = files.filter((f) => f.type === "system-prompt");
    const memories = files.filter((f) => f.type === "memory");

    return [...instructions, ...systemPrompts, ...rules, ...memories];
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

export async function buildSystemPromptWithContext(
  basePrompt: string,
  workspacePath: string
): Promise<string> {
  const discovery = new ContextFileDiscovery();
  const contextFiles = await discovery.getContextFilesForSession(workspacePath);

  if (contextFiles.length === 0) return basePrompt;

  const contextSection = contextFiles
    .map((f) => `### ${f.name}\n\n${f.content}`)
    .join("\n\n");

  return `${basePrompt}\n\n## Active Context\n\n${contextSection}`;
}
