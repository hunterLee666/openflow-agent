import type { ToolDefinition } from "../types/index.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const execAsync = promisify(exec);

export interface IDEConfig {
  workspaceRoot?: string;
  eslintConfigPath?: string;
  prettierConfigPath?: string;
}

export function createIDETools(config: IDEConfig = {}): ToolDefinition[] {
  const workspaceRoot = config.workspaceRoot || process.cwd();

  return [
    {
      name: "LintCheck",
      description: "Run linter (ESLint, Pylint, etc.) on files and return warnings/errors",
      inputSchema: {
        type: "object",
        properties: {
          files: { type: "array", items: { type: "string" }, description: "Files to lint (optional, defaults to all)" },
          fix: { type: "boolean", description: "Auto-fix fixable issues (default: false)" },
        },
        required: [],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { files, fix = false } = input as { files?: string[]; fix?: boolean };

        const packageJsonPath = join(workspaceRoot, "package.json");
        const hasPackageJson = await stat(packageJsonPath).catch(() => false);

        if (!hasPackageJson) {
          return "No package.json found. Linting requires a Node.js project.";
        }

        const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
        const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };

        let command: string;

        if (deps["eslint"]) {
          const filesArg = files && files.length > 0 ? files.join(" ") : ".";
          command = `npx eslint ${filesArg}${fix ? " --fix" : ""} --format json`;
        } else if (deps["biome"]) {
          const filesArg = files && files.length > 0 ? files.join(" ") : ".";
          command = `npx biome check ${filesArg}${fix ? " --write" : ""}`;
        } else if (deps["pylint"]) {
          const filesArg = files && files.length > 0 ? files.join(" ") : ".";
          command = `pylint ${filesArg}${fix ? " --fix" : ""}`;
        } else {
          return "No linter found. Install ESLint, Biome, or Pylint first.";
        }

        try {
          const { stdout, stderr } = await execAsync(command, { cwd: workspaceRoot, timeout: 60000 });

          if (fix) {
            return `Linting with auto-fix completed.\n${stdout || stderr || "No issues found."}`;
          }

          return stdout || stderr || "No linting issues found.";
        } catch (error) {
          const errorOutput = (error as any).stdout || (error as any).stderr || (error as Error).message;
          return `Linting completed with issues:\n${errorOutput.slice(0, 5000)}`;
        }
      },
    },
    {
      name: "FormatCheck",
      description: "Check code formatting (Prettier, Black, etc.) and optionally fix",
      inputSchema: {
        type: "object",
        properties: {
          files: { type: "array", items: { type: "string" }, description: "Files to check (optional, defaults to all)" },
          fix: { type: "boolean", description: "Auto-fix formatting issues (default: false)" },
        },
        required: [],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { files, fix = false } = input as { files?: string[]; fix?: boolean };

        const packageJsonPath = join(workspaceRoot, "package.json");
        const hasPackageJson = await stat(packageJsonPath).catch(() => false);

        let command: string;

        if (hasPackageJson) {
          const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
          const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };

          if (deps["prettier"]) {
            const filesArg = files && files.length > 0 ? files.join(" ") : "**/*.{js,jsx,ts,tsx,css,scss,json,md}";
            command = `npx prettier ${filesArg}${fix ? " --write" : " --check"}`;
          } else if (deps["biome"]) {
            const filesArg = files && files.length > 0 ? files.join(" ") : ".";
            command = `npx biome format ${filesArg}${fix ? " --write" : ""}`;
          } else {
            return "No formatter found. Install Prettier or Biome first.";
          }
        } else {
          const pythonFiles = files?.filter((f) => f.endsWith(".py")) || [];
          if (pythonFiles.length > 0) {
            command = `black ${pythonFiles.join(" ")}${fix ? "" : " --check"}`;
          } else {
            return "No package.json or Python files found. Install Prettier or Black first.";
          }
        }

        try {
          const { stdout, stderr } = await execAsync(command, { cwd: workspaceRoot, timeout: 60000 });
          return stdout || stderr || "Formatting check passed.";
        } catch (error) {
          const errorOutput = (error as any).stdout || (error as any).stderr || (error as Error).message;
          return `Formatting issues found:\n${errorOutput.slice(0, 5000)}`;
        }
      },
    },
    {
      name: "TypeCheck",
      description: "Run type checking (TypeScript, mypy, etc.) on the project",
      inputSchema: {
        type: "object",
        properties: {
          files: { type: "array", items: { type: "string" }, description: "Files to type-check (optional, defaults to all)" },
        },
        required: [],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { files } = input as { files?: string[] };

        const packageJsonPath = join(workspaceRoot, "package.json");
        const hasPackageJson = await stat(packageJsonPath).catch(() => false);

        let command: string;

        if (hasPackageJson) {
          const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
          const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };

          if (deps["typescript"]) {
            const filesArg = files && files.length > 0 ? files.join(" ") : "";
            command = `npx tsc --noEmit ${filesArg}`;
          } else if (deps["tsc"]) {
            command = "npx tsc --noEmit";
          } else {
            return "TypeScript not found. Install TypeScript first.";
          }
        } else {
          const pythonFiles = files?.filter((f) => f.endsWith(".py")) || [];
          if (pythonFiles.length > 0) {
            command = `mypy ${pythonFiles.join(" ")}`;
          } else {
            return "No package.json or Python files found. Install TypeScript or mypy first.";
          }
        }

        try {
          const { stdout } = await execAsync(command, { cwd: workspaceRoot, timeout: 120000 });
          return stdout || "Type checking passed. No errors found.";
        } catch (error) {
          const errorOutput = (error as any).stdout || (error as any).stderr || (error as Error).message;
          return `Type checking completed with errors:\n${errorOutput.slice(0, 5000)}`;
        }
      },
    },
    {
      name: "GetDiagnostics",
      description: "Get IDE diagnostics (errors, warnings, info) for files",
      inputSchema: {
        type: "object",
        properties: {
          files: { type: "array", items: { type: "string" }, description: "Files to get diagnostics for" },
        },
        required: [],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { files } = input as { files?: string[] };

        const lines: string[] = [];
        const targetFiles = files || [];

        for (const file of targetFiles) {
          const filePath = join(workspaceRoot, file);

          try {
            const { stdout } = await execAsync(`npx eslint ${file} --format json`, { cwd: workspaceRoot, timeout: 30000 });
            const results = JSON.parse(stdout);

            if (results.length > 0 && results[0].messages) {
              lines.push(`# ${file}`);
              for (const message of results[0].messages) {
                const severity = message.severity === 2 ? "Error" : "Warning";
                lines.push(`- ${severity} [Line ${message.line}, Col ${message.column}]: ${message.message}`);
                if (message.ruleId) {
                  lines.push(`  Rule: ${message.ruleId}`);
                }
              }
              lines.push("");
            }
          } catch {
            lines.push(`# ${file}`);
            lines.push("- No ESLint diagnostics (or ESLint not configured)");
            lines.push("");
          }
        }

        return lines.join("\n") || "No files specified for diagnostics.";
      },
    },
    {
      name: "RunTests",
      description: "Run project tests with coverage reporting",
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Test file pattern to run (e.g., '*.test.ts')" },
          coverage: { type: "boolean", description: "Generate coverage report (default: true)" },
          watch: { type: "boolean", description: "Run in watch mode (default: false)" },
        },
        required: [],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { pattern, coverage = true, watch = false } = input as { pattern?: string; coverage?: boolean; watch?: boolean };

        const packageJsonPath = join(workspaceRoot, "package.json");
        const hasPackageJson = await stat(packageJsonPath).catch(() => false);

        let command: string;

        if (hasPackageJson) {
          const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
          const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };

          if (deps["jest"]) {
            command = `npx jest${pattern ? ` --testMatch "**/${pattern}"` : ""}${coverage ? " --coverage" : ""}${watch ? " --watch" : ""}`;
          } else if (deps["vitest"]) {
            command = `npx vitest run${pattern ? ` ${pattern}` : ""}${coverage ? " --coverage" : ""}`;
          } else if (deps["mocha"]) {
            command = `npx mocha${pattern ? ` "${pattern}"` : ""}`;
          } else if (deps["ava"]) {
            command = `npx ava${pattern ? ` ${pattern}` : ""}`;
          } else {
            return "No test framework found. Install Jest, Vitest, Mocha, or AVA first.";
          }
        } else {
          const pyprojectPath = join(workspaceRoot, "pyproject.toml");
          const hasPyproject = await stat(pyprojectPath).catch(() => false);

          if (hasPyproject) {
            command = `pytest${pattern ? ` ${pattern}` : ""}${coverage ? " --cov" : ""}`;
          } else {
            return "No Node.js or Python project found. Install a test framework first.";
          }
        }

        try {
          const { stdout } = await execAsync(command, { cwd: workspaceRoot, timeout: 120000 });
          return `Test Results:\n${stdout}`;
        } catch (error) {
          const errorOutput = (error as any).stdout || (error as any).stderr || (error as Error).message;
          return `Tests completed with failures:\n${errorOutput.slice(0, 5000)}`;
        }
      },
    },
  ];
}
