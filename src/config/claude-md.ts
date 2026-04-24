import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "../utils/paths.js";

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

function readIfExists(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {
    // ignore
  }
  return null;
}

function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(process.env.HOME || "/Users/htli", filePath.slice(2));
  }
  return filePath;
}

function ancestorsFromRootTo(cwd: string, repoRoot: string): string[] {
  const ancestors: string[] = [];
  const rel = path.relative(repoRoot, cwd);
  const parts = rel.split(path.sep);

  let current = repoRoot;
  for (const part of parts) {
    if (part && part !== ".") {
      current = path.join(current, part);
      ancestors.push(current);
    }
  }

  return ancestors.slice(0, -1);
}

export function loadClaudeMdStack(cwd: string): ClaudeMdResult {
  const parts: string[] = [];
  const config: ClaudeMdConfig = {
    global: null,
    project: null,
    directory: [],
    local: null,
  };

  const globalPath = expandHome("~/.claude/CLAUDE.md");
  const globalContent = readIfExists(globalPath);
  if (globalContent) {
    config.global = globalPath;
    parts.push(globalContent);
  }

  const repoRoot = findRepoRoot(cwd);
  if (repoRoot) {
    const projectPath = path.join(repoRoot, "CLAUDE.md");
    const projectContent = readIfExists(projectPath);
    if (projectContent) {
      config.project = projectPath;
      parts.push(projectContent);
    }

    const ancestors = ancestorsFromRootTo(cwd, repoRoot);
    for (const dir of ancestors) {
      const dirPath = path.join(dir, "CLAUDE.md");
      const dirContent = readIfExists(dirPath);
      if (dirContent) {
        config.directory.push(dirPath);
        parts.push(dirContent);
      }
    }

    const localPath = path.join(repoRoot, ".claude", "CLAUDE.local.md");
    const localContent = readIfExists(localPath);
    if (localContent) {
      config.local = localPath;
      parts.push(localContent);
    }
  }

  const combined = parts.filter(Boolean).join("\n\n---\n\n");
  const lineCount = combined.split("\n").length;

  return {
    content: combined,
    config,
    lineCount,
  };
}

export function validateClaudeMdLineCount(content: string): {
  valid: boolean;
  lineCount: number;
  suggestion: string;
} {
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

export function shouldIgnoreForGit(filePath: string): boolean {
  const ignored = [".claude/CLAUDE.local.md"];
  const fileName = path.basename(filePath);
  const relative = path.relative(process.cwd(), filePath);

  for (const pattern of ignored) {
    if (relative.endsWith(pattern) || fileName === "CLAUDE.local.md") {
      return true;
    }
  }
  return false;
}
