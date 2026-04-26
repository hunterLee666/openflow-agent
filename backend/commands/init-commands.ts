import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { analyzeProject, formatProjectAnalysis } from "./dev-commands.js";
import { z } from "zod";

export const InitConfigSchema = z.object({
  workspaceRoot: z.string(),
  projectName: z.string().optional(),
  description: z.string().optional(),
  conventions: z.array(z.string()).optional(),
  commands: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })).optional(),
});

export type InitConfig = z.infer<typeof InitConfigSchema>;

export async function initializeProject(config: InitConfig): Promise<string> {
  const openflowDir = join(config.workspaceRoot, ".openflow");
  await mkdir(openflowDir, { recursive: true });

  const analysis = await analyzeProject(config.workspaceRoot);

  const configContent = generateConfigFile(analysis, config);
  await writeFile(join(openflowDir, "config.json"), configContent);

  const instructionsContent = generateInstructionsFile(analysis, config);
  await writeFile(join(openflowDir, "INSTRUCTIONS.md"), instructionsContent);

  return formatProjectAnalysis(analysis);
}

function generateConfigFile(analysis: any, config: InitConfig): string {
  return JSON.stringify({
    name: config.projectName || analysis.name,
    description: config.description || `AI-assisted project: ${analysis.name}`,
    version: "1.0.0",
    language: analysis.language,
    framework: analysis.framework,
    packageManager: analysis.packageManager,
    conventions: config.conventions || analysis.codingConventions,
    commands: config.commands || analysis.keyCommands,
    ai: {
      model: "auto",
      maxTokens: 8192,
      temperature: 0.1,
      systemPrompt: `You are an expert ${analysis.language} developer working on ${analysis.name}.`,
    },
  }, null, 2);
}

function generateInstructionsFile(analysis: any, config: InitConfig): string {
  const lines = [
    `# ${config.projectName || analysis.name}`,
    "",
    config.description && `> ${config.description}`,
    "",
    "## Tech Stack",
    ...analysis.techStack.map((t: string) => `- ${t}`),
    "",
    analysis.framework && `## Framework`,
    analysis.framework && `- ${analysis.framework}`,
    "",
    "## Project Structure",
    "```",
    formatDirectoryTree(analysis.structure, ""),
    "```",
    "",
    "## Coding Conventions",
    ...(config.conventions || analysis.codingConventions).map((c: string) => `- ${c}`),
    "",
    "## Key Commands",
    ...(config.commands || analysis.keyCommands).map((c: { name: string; description: string }) => `- \`${c.name}\` - ${c.description}`),
    "",
    "## AI Instructions",
    "",
    "### Code Style",
    "- Follow existing code patterns and conventions",
    "- Use TypeScript strict mode",
    "- Add JSDoc comments for public APIs",
    "- Write tests for new functionality",
    "",
    "### Git Workflow",
    "- Create descriptive commit messages",
    "- Use conventional commits format",
    "- Keep commits atomic and focused",
    "",
    "### Review Process",
    "- Review code for security vulnerabilities",
    "- Check for performance optimizations",
    "- Ensure test coverage",
    "",
  ].filter(Boolean);

  return lines.join("\n");
}

function formatDirectoryTree(node: any, prefix: string): string {
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
