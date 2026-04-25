import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export interface ProjectAnalysis {
  name: string;
  rootDir: string;
  language: string;
  framework?: string;
  packageManager?: string;
  totalFiles: number;
  totalLines: number;
  structure: DirectoryNode;
  keyCommands: Array<{ name: string; command: string; description: string }>;
  codingConventions: string[];
  techStack: string[];
}

interface DirectoryNode {
  name: string;
  type: "directory" | "file";
  children?: DirectoryNode[];
  size?: number;
}

interface LanguageStats {
  [extension: string]: { files: number; lines: number };
}

const TECH_STACK_INDICATORS: Record<string, string[]> = {
  "package.json": ["Node.js", "npm/yarn/pnpm"],
  "tsconfig.json": ["TypeScript"],
  "pyproject.toml": ["Python"],
  "requirements.txt": ["Python"],
  "Cargo.toml": ["Rust"],
  "go.mod": ["Go"],
  "pom.xml": ["Java/Maven"],
  "build.gradle": ["Java/Gradle"],
  "Gemfile": ["Ruby"],
  "composer.json": ["PHP"],
  ".svelte-kit": ["SvelteKit"],
  "next.config.js": ["Next.js"],
  "next.config.ts": ["Next.js"],
  "nuxt.config.ts": ["Nuxt.js"],
  "vite.config.ts": ["Vite"],
  "vite.config.js": ["Vite"],
  "tailwind.config.js": ["Tailwind CSS"],
  "tailwind.config.ts": ["Tailwind CSS"],
};

const FRAMEWORK_INDICATORS: Record<string, string> = {
  "react": "React",
  "vue": "Vue.js",
  "angular": "Angular",
  "svelte": "Svelte",
  "next": "Next.js",
  "nuxt": "Nuxt.js",
  "express": "Express",
  "fastify": "Fastify",
  "django": "Django",
  "flask": "Flask",
  "fastapi": "FastAPI",
  "spring": "Spring Boot",
  "rails": "Ruby on Rails",
  "laravel": "Laravel",
};

const PACKAGE_MANAGERS: Record<string, string> = {
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
  "pnpm-lock.yaml": "pnpm",
  "bun.lockb": "bun",
  "Pipfile.lock": "pipenv",
  "poetry.lock": "poetry",
};

export async function analyzeProject(rootDir: string): Promise<ProjectAnalysis> {
  const structure = await buildDirectoryTree(rootDir, rootDir, 2);
  const languageStats = await analyzeLanguages(rootDir);
  const techStack = detectTechStack(rootDir);
  const framework = detectFramework(rootDir);
  const packageManager = detectPackageManager(rootDir);
  const keyCommands = await detectKeyCommands(rootDir);
  const codingConventions = await detectCodingConventions(rootDir);

  const totalFiles = Object.values(languageStats).reduce((sum, s) => sum + s.files, 0);
  const totalLines = Object.values(languageStats).reduce((sum, s) => sum + s.lines, 0);

  const primaryLanguage = Object.entries(languageStats)
    .sort((a, b) => b[1].lines - a[1].lines)[0]?.[0]?.slice(1) || "unknown";

  return {
    name: rootDir.split("/").pop() || "unknown",
    rootDir,
    language: primaryLanguage,
    framework,
    packageManager,
    totalFiles,
    totalLines,
    structure,
    keyCommands,
    codingConventions,
    techStack,
  };
}

export function formatProjectAnalysis(analysis: ProjectAnalysis): string {
  const lines = [
    `# Project: ${analysis.name}`,
    "",
    "## Tech Stack",
    ...analysis.techStack.map((t) => `- ${t}`),
    "",
    analysis.framework && `## Framework`,
    analysis.framework && `- ${analysis.framework}`,
    "",
    analysis.packageManager && `## Package Manager`,
    analysis.packageManager && `- ${analysis.packageManager}`,
    "",
    "## Statistics",
    `- Language: ${analysis.language}`,
    `- Total Files: ${analysis.totalFiles}`,
    `- Total Lines: ${analysis.totalLines.toLocaleString()}`,
    "",
    "## Key Commands",
    ...analysis.keyCommands.map((c) => `- \`${c.command}\` - ${c.description}`),
    "",
    "## Coding Conventions",
    ...analysis.codingConventions.map((c) => `- ${c}`),
    "",
    "## Structure",
    "```",
    formatDirectoryTree(analysis.structure, ""),
    "```",
  ].filter(Boolean);

  return lines.join("\n");
}

async function buildDirectoryTree(rootDir: string, currentDir: string, maxDepth: number, currentDepth = 0): Promise<DirectoryNode> {
  const name = currentDir === rootDir ? currentDir.split("/").pop() || "." : relative(rootDir, currentDir);
  const fileStat = await stat(currentDir);

  if (!fileStat.isDirectory()) {
    return {
      name: name.split("/").pop() || name,
      type: "file",
      size: fileStat.size,
    };
  }

  if (currentDepth >= maxDepth) {
    return {
      name,
      type: "directory",
    };
  }

  const entries = await readdir(currentDir);
  const children: DirectoryNode[] = [];

  const ignoreDirs = new Set(["node_modules", ".git", "dist", "build", "out", ".next", "__pycache__", ".venv", "vendor"]);

  for (const entry of entries.sort()) {
    if (entry.startsWith(".")) continue;

    const fullPath = join(currentDir, entry);
    const entryStat = await stat(fullPath);

    if (entryStat.isDirectory() && ignoreDirs.has(entry)) continue;

    children.push(await buildDirectoryTree(rootDir, fullPath, maxDepth, currentDepth + 1));
  }

  return {
    name,
    type: "directory",
    children,
  };
}

async function analyzeLanguages(rootDir: string): Promise<LanguageStats> {
  const stats: LanguageStats = {};
  const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".rb", ".php", ".css", ".scss", ".html", ".vue", ".svelte", ".md"]);

  async function scanDir(dir: string) {
    const entries = await readdir(dir);
    const ignoreDirs = new Set(["node_modules", ".git", "dist", "build", "out", ".next", "__pycache__", ".venv", "vendor"]);

    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const fullPath = join(dir, entry);
      const entryStat = await stat(fullPath);

      if (entryStat.isDirectory()) {
        if (!ignoreDirs.has(entry)) {
          await scanDir(fullPath);
        }
      } else {
        const ext = entry.slice(entry.lastIndexOf("."));
        if (extensions.has(ext)) {
          if (!stats[ext]) {
            stats[ext] = { files: 0, lines: 0 };
          }
          stats[ext].files++;
          try {
            const content = await readFile(fullPath, "utf-8");
            stats[ext].lines += content.split("\n").length;
          } catch {
            // Skip binary files
          }
        }
      }
    }
  }

  await scanDir(rootDir);
  return stats;
}

function detectTechStack(rootDir: string): string[] {
  const techStack: string[] = [];

  for (const [file, technologies] of Object.entries(TECH_STACK_INDICATORS)) {
    try {
      const fullPath = join(rootDir, file);
      stat(fullPath);
      techStack.push(...technologies);
    } catch {
      // File doesn't exist
    }
  }

  return [...new Set(techStack)];
}

function detectFramework(rootDir: string): string | undefined {
  try {
    const packageJsonPath = join(rootDir, "package.json");
    const content = JSON.parse(require("fs").readFileSync(packageJsonPath, "utf-8"));
    const allDeps = {
      ...(content.dependencies || {}),
      ...(content.devDependencies || {}),
    };

    for (const [key, framework] of Object.entries(FRAMEWORK_INDICATORS)) {
      if (allDeps[key]) {
        return framework;
      }
    }
  } catch {
    // No package.json or parse error
  }

  return undefined;
}

function detectPackageManager(rootDir: string): string | undefined {
  for (const [file, manager] of Object.entries(PACKAGE_MANAGERS)) {
    try {
      stat(join(rootDir, file));
      return manager;
    } catch {
      // File doesn't exist
    }
  }
  return undefined;
}

async function detectKeyCommands(rootDir: string): Promise<Array<{ name: string; command: string; description: string }>> {
  const commands: Array<{ name: string; command: string; description: string }> = [];

  try {
    const packageJsonPath = join(rootDir, "package.json");
    const content = JSON.parse(await readFile(packageJsonPath, "utf-8"));
    const scripts = content.scripts || {};

    const importantScripts: Record<string, string> = {
      "dev": "Start development server",
      "start": "Start production server",
      "build": "Build for production",
      "test": "Run test suite",
      "lint": "Run linter",
      "typecheck": "Run type checking",
      "format": "Format code",
    };

    for (const [name, description] of Object.entries(importantScripts)) {
      if (scripts[name]) {
        commands.push({
          name,
          command: `npm run ${name}`,
          description,
        });
      }
    }
  } catch {
    // No package.json
  }

  return commands;
}

async function detectCodingConventions(rootDir: string): Promise<string[]> {
  const conventions: string[] = [];

  try {
    const tsconfigPath = join(rootDir, "tsconfig.json");
    const tsconfig = JSON.parse(await readFile(tsconfigPath, "utf-8"));
    if (tsconfig.compilerOptions?.strict) {
      conventions.push("TypeScript strict mode enabled");
    }
  } catch {
    // No tsconfig.json
  }

  try {
    const eslintPath = join(rootDir, ".eslintrc.json");
    await readFile(eslintPath, "utf-8");
    conventions.push("ESLint configured for code quality");
  } catch {
    // Try other ESLint config formats
    try {
      await readFile(join(rootDir, "eslint.config.js"), "utf-8");
      conventions.push("ESLint configured for code quality");
    } catch {
      // No ESLint
    }
  }

  try {
    const prettierPath = join(rootDir, ".prettierrc");
    await readFile(prettierPath, "utf-8");
    conventions.push("Prettier configured for code formatting");
  } catch {
    // No Prettier
  }

  return conventions;
}

function formatDirectoryTree(node: DirectoryNode, prefix: string): string {
  let result = "";

  if (node.type === "directory") {
    result += `${prefix}${node.name}/\n`;
    if (node.children) {
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        const isLast = i === children.length - 1;
        const newPrefix = prefix + (isLast ? "    " : "│   ");
        result += formatDirectoryTree(children[i], newPrefix);
      }
    }
  } else {
    result += `${prefix}${node.name}\n`;
  }

  return result;
}
