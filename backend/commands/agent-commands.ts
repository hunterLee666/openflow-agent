import type { PluginManager } from "../plugins/index.js";
import type { AgentMode } from "../agents/mode-selector.js";
import { ModeSelector } from "../agents/mode-selector.js";

interface AgentCommandArgs {
  name?: string;
  mode?: AgentMode;
  goal?: string;
  context?: string;
  list?: boolean;
  analyze?: boolean;
}

export function createAgentCommands(manager: PluginManager): Record<string, (args: string) => Promise<string>> {
  const modeSelector = new ModeSelector();

  return {
    async run(args: string): Promise<string> {
      const parsed = parseArgs(args);

      if (!parsed.name) {
        return "Usage: /agent run <name> [--mode single|swarm|coordinator] [--goal <goal>] [--context <context>]\n\n" +
          "Options:\n" +
          "  --mode       Force execution mode (single|swarm|coordinator|auto)\n" +
          "  --goal       Task goal description\n" +
          "  --context    Additional context for the task\n" +
          "\nExamples:\n" +
          "  /agent run code-reviewer --goal 'Review src/auth.ts'\n" +
          "  /agent run dev-team --mode swarm --goal 'Implement feature X'\n" +
          "  /agent run project-analyzer --mode coordinator --goal 'Analyze codebase' --context 'Focus on security'";
      }

      const agent = manager.get(parsed.name);
      if (!agent) {
        return `Agent "${parsed.name}" not found. Use /agent list to see available agents.`;
      }

      if (!parsed.goal) {
        return `Error: --goal is required. What should the agent do?`;
      }

      const mode = parsed.mode || "auto";

      return `Running agent "${parsed.name}" in ${mode} mode...\n\n` +
        `Goal: ${parsed.goal}\n` +
        `${parsed.context ? `Context: ${parsed.context}\n` : ""}` +
        `Mode: ${mode}\n\n` +
        `[Agent execution would happen here with the selected mode]`;
    },

    async analyze(args: string): Promise<string> {
      if (!args.trim()) {
        return "Usage: /agent analyze <task description>\n\n" +
          "Analyzes a task and recommends the best execution mode.\n\n" +
          "Example: /agent analyze 'Research the codebase, implement a new feature, and write tests'";
      }

      const taskDescription = args.trim();

      const analysis = modeSelector.analyzeTask({
        id: `analyze_${Date.now()}`,
        type: "analysis",
        description: taskDescription,
        prompt: taskDescription,
        systemPrompt: "",
        allowedTools: [],
        timeout: 0,
        maxTurns: 0,
      });

      const modeRecommendations = {
        single: "🎯 Single Agent - Simple task, one agent is sufficient",
        swarm: "🐝 Swarm Mode - Multiple agents collaborate via handoffs",
        coordinator: "👔 Coordinator Mode - Central coordinator decomposes and assigns tasks",
      };

      const complexityLabels = {
        simple: "Simple",
        moderate: "Moderate",
        complex: "Complex",
      };

      const lines = [
        "Task Analysis:\n",
        `Task: ${taskDescription}`,
        `Complexity Score: ${(analysis.score * 100).toFixed(0)}%`,
        `Complexity Level: ${complexityLabels[analysis.factors.complexityLevel]}`,
        `Recommended Mode: ${modeRecommendations[analysis.recommendedMode]}`,
        "",
        "Factors:",
        `  Multiple Subtasks: ${analysis.factors.hasMultipleSubtasks ? "Yes" : "No"}`,
        `  Requires Specialization: ${analysis.factors.requiresSpecialization ? "Yes" : "No"}`,
        `  Has Dependencies: ${analysis.factors.hasDependencies ? "Yes" : "No"}`,
        `  Requires Parallelism: ${analysis.factors.requiresParallelism ? "Yes" : "No"}`,
        `  Estimated Tokens: ${analysis.factors.estimatedTokenCount}`,
        "",
        "💡 Tip: Use /agent run <name> --mode <mode> to force a specific mode",
      ];

      return lines.join("\n");
    },

    async list(args: string): Promise<string> {
      const agents = manager.list("agent");

      if (agents.length === 0) {
        return "No agents found. Create agent definitions in .openflow/agents/ directory.";
      }

      const lines = [
        `Found ${agents.length} agent(s):\n`,
        `Name`.padEnd(25) + `Mode`.padEnd(15) + `Workers`,
        "─".repeat(70),
      ];

      for (const agent of agents) {
        const entry = manager.getEntry(agent.name);
        const manifest = entry?.manifest;
        const mode = (manifest as any)?.mode || "auto";
        const workerCount = (manifest as any)?.workers?.length || 0;
        const modeLabel = mode === "auto" ? "auto" : mode;

        lines.push(
          agent.name.padEnd(25) +
          modeLabel.padEnd(15) +
          (workerCount > 0 ? `${workerCount} workers` : "single agent")
        );
      }

      lines.push("\n💡 Use /agent run <name> --mode <mode> to specify execution mode");
      lines.push("💡 Use /agent analyze <task> to get mode recommendation");

      return lines.join("\n");
    },

    async modes(args: string): Promise<string> {
      return [
        "Agent Execution Modes:\n",
        "🎯 single - Single Agent Mode",
        "   Simple tasks handled by one agent",
        "   Best for: Quick, focused tasks",
        "   Example: /agent run code-explainer --mode single\n",
        "🐝 swarm - Swarm Mode (蜂群模式)",
        "   Multiple agents collaborate via handoffs",
        "   Decentralized: agents decide who to handoff to",
        "   Best for: Tasks requiring multiple specializations",
        "   Example: /agent run review-team --mode swarm\n",
        "👔 coordinator - Coordinator Mode (协调者模式)",
        "   Central coordinator decomposes and assigns tasks",
        "   Parallel execution with dependency management",
        "   Best for: Complex tasks with clear subtasks",
        "   Example: /agent run feature-team --mode coordinator\n",
        "🤖 auto - Auto Mode (Default)",
        "   System analyzes task and selects best mode",
        "   Factors: complexity, dependencies, parallelism",
        "   Example: /agent run dev-team --goal 'Implement feature'\n",
        "💡 Use /agent analyze <task> to get mode recommendation",
      ].join("\n");
    },
  };
}

function parseArgs(args: string): Partial<AgentCommandArgs> {
  const parts = args.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const result: Partial<AgentCommandArgs> = {};

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].replace(/"/g, "");

    if (part === "--mode" && i + 1 < parts.length) {
      result.mode = parts[i + 1].replace(/"/g, "") as AgentMode;
      i++;
    } else if (part === "--goal" && i + 1 < parts.length) {
      result.goal = parts[i + 1].replace(/"/g, "");
      i++;
    } else if (part === "--context" && i + 1 < parts.length) {
      result.context = parts[i + 1].replace(/"/g, "");
      i++;
    } else if (!result.name) {
      result.name = part;
    }
  }

  return result;
}
