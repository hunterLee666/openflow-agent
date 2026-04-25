import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { defineTool, createReadOnlyTool, createWriteTool } from "./tool-factory.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const execAsync = promisify(exec);

const LintCheckInputSchema = z.object({
  files: z.array(z.string()).optional(),
  fix: z.boolean().optional(),
});

const FormatCheckInputSchema = z.object({
  files: z.array(z.string()).optional(),
  fix: z.boolean().optional(),
});

const TypeCheckInputSchema = z.object({
  files: z.array(z.string()).optional(),
});

const GetDiagnosticsInputSchema = z.object({
  files: z.array(z.string()).optional(),
});

const RunTestsInputSchema = z.object({
  pattern: z.string().optional(),
  coverage: z.boolean().optional(),
  watch: z.boolean().optional(),
});

const IDEOutputSchema = z.object({
  message: z.string(),
  success: z.boolean().optional(),
  issues: z.number().optional(),
});

export interface IDEConfig {
  workspaceRoot?: string;
  eslintConfigPath?: string;
  prettierConfigPath?: string;
}

export function createIDETools(config: IDEConfig = {}): ToolDefinition[] {
  const workspaceRoot = config.workspaceRoot || process.cwd();

  const lintCheckTool = createWriteTool({
    name: "LintCheck",
    description: "Run linter (ESLint, Pylint, etc.) on files and return warnings/errors",
    inputSchema: LintCheckInputSchema,
    outputSchema: IDEOutputSchema,
    handler: async (input) => {
      const files = input.files;
      const fix = input.fix || false;

      const packageJsonPath = join(workspaceRoot, "package.json");
      const hasPackageJson = await stat(packageJsonPath).catch(() => false);

      if (!hasPackageJson) {
        throw new Error("No package.json found. Linting requires a Node.js project.");
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
        throw new Error("No linter found. Install ESLint, Biome, or Pylint first.");
      }

      try {
        const { stdout, stderr } = await execAsync(command, { cwd: workspaceRoot, timeout: 60000 });

        if (fix) {
          return { message: `Linting with auto-fix completed.\n${stdout || stderr || "No issues found."}`, success: true };
        }

        return { message: stdout || stderr || "No linting issues found.", success: true };
      } catch (error) {
        const errorOutput = (error as any).stdout || (error as any).stderr || (error as Error).message;
        return { message: `Linting completed with issues:\n${errorOutput.slice(0, 5000)}`, success: false };
      }
    },
  });

  const formatCheckTool = createWriteTool({
    name: "FormatCheck",
    description: "Check code formatting (Prettier, Black, etc.) and optionally fix",
    inputSchema: FormatCheckInputSchema,
    outputSchema: IDEOutputSchema,
    handler: async (input) => {
      const files = input.files;
      const fix = input.fix || false;

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
          throw new Error("No formatter found. Install Prettier or Biome first.");
        }
      } else {
        const pythonFiles = files?.filter((f) => f.endsWith(".py")) || [];
        if (pythonFiles.length > 0) {
          command = `black ${pythonFiles.join(" ")}${fix ? "" : " --check"}`;
        } else {
          throw new Error("No package.json or Python files found. Install Prettier or Black first.");
        }
      }

      try {
        const { stdout, stderr } = await execAsync(command, { cwd: workspaceRoot, timeout: 60000 });
        return { message: stdout || stderr || "Formatting check passed.", success: true };
      } catch (error) {
        const errorOutput = (error as any).stdout || (error as any).stderr || (error as Error).message;
        return { message: `Formatting issues found:\n${errorOutput.slice(0, 5000)}`, success: false };
      }
    },
  });

  const typeCheckTool = createReadOnlyTool({
    name: "TypeCheck",
    description: "Run type checking (TypeScript, mypy, etc.) on the project",
    inputSchema: TypeCheckInputSchema,
    outputSchema: IDEOutputSchema,
    handler: async (input) => {
      const files = input.files;

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
          throw new Error("TypeScript not found. Install TypeScript first.");
        }
      } else {
        const pythonFiles = files?.filter((f) => f.endsWith(".py")) || [];
        if (pythonFiles.length > 0) {
          command = `mypy ${pythonFiles.join(" ")}`;
        } else {
          throw new Error("No package.json or Python files found. Install TypeScript or mypy first.");
        }
      }

      try {
        const { stdout } = await execAsync(command, { cwd: workspaceRoot, timeout: 120000 });
        return { message: stdout || "Type checking passed. No errors found.", success: true };
      } catch (error) {
        const errorOutput = (error as any).stdout || (error as any).stderr || (error as Error).message;
        return { message: `Type checking completed with errors:\n${errorOutput.slice(0, 5000)}`, success: false };
      }
    },
  });

  const getDiagnosticsTool = createReadOnlyTool({
    name: "GetDiagnostics",
    description: "Get IDE diagnostics (errors, warnings, info) for files",
    inputSchema: GetDiagnosticsInputSchema,
    outputSchema: IDEOutputSchema,
    handler: async (input) => {
      const files = input.files || [];

      const lines: string[] = [];
      let issueCount = 0;

      for (const file of files) {
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
              issueCount++;
            }
            lines.push("");
          }
        } catch {
          lines.push(`# ${file}`);
          lines.push("- No ESLint diagnostics (or ESLint not configured)");
          lines.push("");
        }
      }

      return { message: lines.join("\n") || "No files specified for diagnostics.", issues: issueCount };
    },
  });

  const runTestsTool = createReadOnlyTool({
    name: "RunTests",
    description: "Run project tests with coverage reporting",
    inputSchema: RunTestsInputSchema,
    outputSchema: IDEOutputSchema,
    handler: async (input) => {
      const pattern = input.pattern;
      const coverage = input.coverage !== undefined ? input.coverage : true;
      const watch = input.watch || false;

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
          throw new Error("No test framework found. Install Jest, Vitest, Mocha, or AVA first.");
        }
      } else {
        const pyprojectPath = join(workspaceRoot, "pyproject.toml");
        const hasPyproject = await stat(pyprojectPath).catch(() => false);

        if (hasPyproject) {
          command = `pytest${pattern ? ` ${pattern}` : ""}${coverage ? " --cov" : ""}`;
        } else {
          throw new Error("No Node.js or Python project found. Install a test framework first.");
        }
      }

      try {
        const { stdout } = await execAsync(command, { cwd: workspaceRoot, timeout: 120000 });
        return { message: `Test Results:\n${stdout}`, success: true };
      } catch (error) {
        const errorOutput = (error as any).stdout || (error as any).stderr || (error as Error).message;
        return { message: `Tests completed with failures:\n${errorOutput.slice(0, 5000)}`, success: false };
      }
    },
  });

  return [lintCheckTool, formatCheckTool, typeCheckTool, getDiagnosticsTool, runTestsTool];
}
