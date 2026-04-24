import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { homedir } from "node:os";
import type { ProjectMemory, ProjectRule } from "./types.js";

export interface ClaudeMdConfig {
  global: string | null;
  project: string | null;
  directory: string[];
  local: string | null;
}

export interface ClaudeMdResult {
  content: string;
  config: ClaudeMdConfig;
  lineCount: number;
}

export interface ClaudeMdValidation {
  valid: boolean;
  lineCount: number;
  suggestion: string;
}

export class FileProjectMemory implements ProjectMemory {
  async loadClaudeMd(cwd: string): Promise<string> {
    const rules = await this.getProjectRules(cwd);
    return rules
      .sort((a, b) => a.priority - b.priority)
      .map((r) => `<!-- ${r.scope}: ${r.path} -->\n${r.content}`)
      .join("\n\n---\n\n");
  }

  async loadLocalClaudeMd(cwd: string): Promise<string | null> {
    const localPath = join(cwd, ".claude", "CLAUDE.local.md");
    if (!existsSync(localPath)) return null;
    return readFile(localPath, "utf-8");
  }

  async getProjectRules(cwd: string): Promise<ProjectRule[]> {
    const rules: ProjectRule[] = [];

    // 1. Global CLAUDE.md
    const globalPath = join(homedir(), ".claude", "CLAUDE.md");
    if (existsSync(globalPath)) {
      const content = await readFile(globalPath, "utf-8");
      rules.push({ scope: "global", path: globalPath, content, priority: 1 });
    }

    // 2. Project root CLAUDE.md
    const projectPath = join(cwd, "CLAUDE.md");
    if (existsSync(projectPath)) {
      const content = await readFile(projectPath, "utf-8");
      rules.push({ scope: "project", path: projectPath, content, priority: 2 });
    }

    // 3. Directory-level CLAUDE.md (walk up from cwd)
    let currentDir = cwd;
    let depth = 3;
    while (currentDir !== dirname(currentDir) && depth > 0) {
      const dirPath = join(currentDir, "CLAUDE.md");
      if (existsSync(dirPath) && dirPath !== projectPath) {
        const content = await readFile(dirPath, "utf-8");
        rules.push({ scope: "directory", path: dirPath, content, priority: 3 + (3 - depth) });
      }
      currentDir = dirname(currentDir);
      depth--;
    }

    // 4. Local CLAUDE.local.md (gitignored, personal)
    const localPath = join(cwd, ".claude", "CLAUDE.local.md");
    if (existsSync(localPath)) {
      const content = await readFile(localPath, "utf-8");
      rules.push({ scope: "local", path: localPath, content, priority: 10 });
    }

    return rules;
  }

  async loadClaudeMdStack(cwd: string): Promise<ClaudeMdResult> {
    const rules = await this.getProjectRules(cwd);
    const config: ClaudeMdConfig = {
      global: null,
      project: null,
      directory: [],
      local: null,
    };

    for (const rule of rules) {
      switch (rule.scope) {
        case "global":
          config.global = rule.path;
          break;
        case "project":
          config.project = rule.path;
          break;
        case "directory":
          config.directory.push(rule.path);
          break;
        case "local":
          config.local = rule.path;
          break;
      }
    }

    const content = rules
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.content)
      .join("\n\n---\n\n");

    return {
      content,
      config,
      lineCount: content.split("\n").length,
    };
  }

  validateClaudeMdLineCount(content: string): ClaudeMdValidation {
    const lineCount = content.split("\n").length;

    if (lineCount < 30) {
      return {
        valid: true,
        lineCount,
        suggestion: "可能缺关键命令，建议补充运行/测试命令",
      };
    }

    if (lineCount > 300) {
      return {
        valid: false,
        lineCount,
        suggestion: "超过300行难以维护，建议精简或拆分为目录级CLAUDE.md",
      };
    }

    return {
      valid: true,
      lineCount,
      suggestion: "行数在合理范围内",
    };
  }

  shouldIgnoreForGit(filePath: string): boolean {
    const ignored = [".claude/CLAUDE.local.md"];
    const fileName = basename(filePath);
    const rel = relative(process.cwd(), filePath);

    for (const pattern of ignored) {
      if (rel.endsWith(pattern) || fileName === "CLAUDE.local.md") {
        return true;
      }
    }
    return false;
  }
}
