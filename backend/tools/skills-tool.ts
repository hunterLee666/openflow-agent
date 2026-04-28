import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";

const SkillsInputSchema = z.object({
  action: z.enum(["list", "load", "unload", "search", "info"]).describe("Action: list available skills, load a skill, unload a skill, search skills, or get skill info"),
  skillId: z.string().optional().describe("Skill ID for load/unload/info actions"),
  query: z.string().optional().describe("Search query for search action"),
  category: z.string().optional().describe("Category filter for list action"),
});

const loadedSkills = new Map<string, {
  name: string;
  description: string;
  category: string;
  loadedAt: number;
  capabilities: string[];
}>();

const availableSkills: Record<string, {
  name: string;
  description: string;
  category: string;
  capabilities: string[];
}> = {
  "skill:code-analysis": {
    name: "Code Analysis",
    description: "Analyzes code structure, complexity, and potential issues",
    category: "development",
    capabilities: ["static-analysis", "complexity-analysis", "pattern-detection"],
  },
  "skill:refactor": {
    name: "Code Refactoring",
    description: "Helps refactor code to improve quality and maintainability",
    category: "development",
    capabilities: ["rename-refactoring", "extract-method", "inline-method", "move-class"],
  },
  "skill:security": {
    name: "Security Analysis",
    description: "Scans for common security vulnerabilities and issues",
    category: "security",
    capabilities: ["sql-injection", "xss-detection", "csrf-analysis", "secret-detection"],
  },
  "skill:test-generator": {
    name: "Test Generator",
    description: "Generates unit tests and integration tests",
    category: "testing",
    capabilities: ["unit-test", "integration-test", "mock-generation", "coverage-analysis"],
  },
  "skill:api-design": {
    name: "API Design",
    description: "Helps design RESTful APIs and GraphQL schemas",
    category: "development",
    capabilities: ["endpoint-design", "schema-generation", "documentation"],
  },
  "skill:database": {
    name: "Database Tools",
    description: "Database design, query optimization, and migration",
    category: "data",
    capabilities: ["schema-design", "query-optimization", "migration", "seed-data"],
  },
  "skill:docker": {
    name: "Docker Helper",
    description: "Docker and containerization assistance",
    category: "devops",
    capabilities: ["dockerfile-gen", "docker-compose", "image-optimization"],
  },
  "skill:git": {
    name: "Git Operations",
    description: "Advanced Git operations and workflows",
    category: "version-control",
    capabilities: ["branch-strategy", "conflict-resolution", "rebase", "cherry-pick"],
  },
  "skill:debug": {
    name: "Debug Assistant",
    description: "Helps debug issues and find root causes",
    category: "development",
    capabilities: ["stack-trace", "log-analysis", " breakpoint-planning"],
  },
  "skill:performance": {
    name: "Performance Tuning",
    description: "Identifies and fixes performance bottlenecks",
    category: "optimization",
    capabilities: ["profiling", "caching-strategy", "query-optimization", "lazy-loading"],
  },
};

type SkillsInput = z.infer<typeof SkillsInputSchema>;

interface SkillsResult {
  success: boolean;
  skillId?: string;
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    loaded: boolean;
    capabilities?: string[];
  }>;
  message?: string;
  error?: string;
}

export function createSkillsTool(): ToolDefinition {
  return {
    name: "Skills",
    description: `Manage and utilize dynamic skills for specialized tasks.
Skills are modular capabilities that can be loaded on-demand to enhance the agent's abilities.

Available actions:
- list: Show all available skills and their status
- load: Load a skill to make it available for use
- unload: Unload a skill when no longer needed
- search: Search for skills by name or capability
- info: Get detailed information about a specific skill

Loading a skill enables its specialized capabilities for the current session.`,
    inputSchema: SkillsInputSchema,
    isReadOnly: false,
    isConcurrencySafe: true,
    async handler(rawInput: unknown): Promise<string> {
      const input = SkillsInputSchema.parse(rawInput);
      console.log(`[Skills] Action: ${input.action}`);

      try {
        switch (input.action) {
          case "list": {
            const skillsList = Object.entries(availableSkills).map(([id, skill]) => ({
              id,
              name: skill.name,
              description: skill.description,
              category: skill.category,
              loaded: loadedSkills.has(id),
            }));

            if (input.category) {
              const filtered = skillsList.filter(s => s.category === input.category);
              const result: SkillsResult = {
                success: true,
                skills: filtered,
                message: `[Skills List - Category: ${input.category}]
Total: ${filtered.length}
${filtered.map(s => `${s.id} [${s.loaded ? "LOADED" : "unloaded"}]
  Name: ${s.name}
  Description: ${s.description}`).join("\n\n")}`,
              };
              return JSON.stringify(result);
            }

            const result: SkillsResult = {
              success: true,
              skills: skillsList,
              message: `[All Skills]
Available: ${skillsList.length}
Loaded: ${loadedSkills.size}

${skillsList.map(s => `${s.id} [${s.loaded ? "LOADED" : "unloaded"}]
  Name: ${s.name}
  Category: ${s.category}
  Description: ${s.description}`).join("\n\n")}`,
            };
            return JSON.stringify(result);
          }

          case "load": {
            if (!input.skillId) {
              return JSON.stringify({ success: false, error: "skillId is required for load action" });
            }
            const skill = availableSkills[input.skillId];
            if (!skill) {
              return JSON.stringify({ success: false, error: `Skill ${input.skillId} not found` });
            }
            if (loadedSkills.has(input.skillId)) {
              return JSON.stringify({
                success: true,
                skillId: input.skillId,
                message: `Skill ${input.skillId} is already loaded`,
              });
            }

            loadedSkills.set(input.skillId, {
              ...skill,
              loadedAt: Date.now(),
            });

            const result: SkillsResult = {
              success: true,
              skillId: input.skillId,
              message: `[Skill Loaded]
Skill ID: ${input.skillId}
Name: ${skill.name}
Capabilities: ${skill.capabilities.join(", ")}
Loaded at: ${new Date().toISOString()}`,
            };
            console.log(`[Skills] Loaded: ${input.skillId}`);
            return JSON.stringify(result);
          }

          case "unload": {
            if (!input.skillId) {
              return JSON.stringify({ success: false, error: "skillId is required for unload action" });
            }
            if (!loadedSkills.has(input.skillId)) {
              return JSON.stringify({ success: false, error: `Skill ${input.skillId} is not loaded` });
            }

            loadedSkills.delete(input.skillId);
            const result: SkillsResult = {
              success: true,
              skillId: input.skillId,
              message: `Skill ${input.skillId} has been unloaded`,
            };
            console.log(`[Skills] Unloaded: ${input.skillId}`);
            return JSON.stringify(result);
          }

          case "search": {
            if (!input.query) {
              return JSON.stringify({ success: false, error: "query is required for search action" });
            }
            const query = input.query.toLowerCase();
            const results = Object.entries(availableSkills)
              .filter(([id, skill]) =>
                id.toLowerCase().includes(query) ||
                skill.name.toLowerCase().includes(query) ||
                skill.description.toLowerCase().includes(query) ||
                skill.capabilities.some(c => c.toLowerCase().includes(query))
              )
              .map(([id, skill]) => ({
                id,
                name: skill.name,
                description: skill.description,
                category: skill.category,
                loaded: loadedSkills.has(id),
              }));

            const result: SkillsResult = {
              success: true,
              skills: results,
              message: `[Search Results for "${input.query}"]
Found: ${results.length}
${results.length === 0 ? "No matching skills found" : ""}
${results.map(s => `${s.id} [${s.loaded ? "LOADED" : "unloaded"}]
  Name: ${s.name}
  Category: ${s.category}
  Description: ${s.description}`).join("\n\n")}`,
            };
            return JSON.stringify(result);
          }

          case "info": {
            if (!input.skillId) {
              return JSON.stringify({ success: false, error: "skillId is required for info action" });
            }
            const skill = availableSkills[input.skillId];
            if (!skill) {
              return JSON.stringify({ success: false, error: `Skill ${input.skillId} not found` });
            }

            const isLoaded = loadedSkills.has(input.skillId);
            const loadedInfo = isLoaded ? loadedSkills.get(input.skillId) : null;

            const result: SkillsResult = {
              success: true,
              skillId: input.skillId,
              message: `[Skill Info]
Skill ID: ${input.skillId}
Name: ${skill.name}
Category: ${skill.category}
Description: ${skill.description}
Status: ${isLoaded ? "LOADED" : "not loaded"}
Capabilities:
${skill.capabilities.map(c => `  - ${c}`).join("\n")}
${isLoaded && loadedInfo ? `
Loaded at: ${new Date(loadedInfo.loadedAt).toISOString()}` : ""}`,
            };
            return JSON.stringify(result);
          }

          default:
            return JSON.stringify({ success: false, error: `Unknown action: ${input.action}` });
        }
      } catch (error) {
        const errorResult: SkillsResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        console.error(`[Skills] Error: ${errorResult.error}`);
        return JSON.stringify(errorResult);
      }
    },
  };
}
