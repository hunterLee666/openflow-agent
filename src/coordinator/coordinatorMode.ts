import type { SubAgent, SubAgentResult } from "./types.js";

export const INTERNAL_TOOLS = new Set([
  "TeamCreate",
  "TeamDelete",
  "SendMessage",
  "TaskStop",
  "SyntheticOutput",
]);

export interface CoordinatorConfig {
  enableWorkerIsolation?: boolean;
  maxWorkerAgents?: number;
  workerToolTimeout?: number;
  simpleMode?: boolean;
}

export interface WorkerAgentConfig {
  agentType: string;
  tools: string[];
  systemPrompt: string;
  capabilities: string[];
}

export function isCoordinatorMode(): boolean {
  return process.env.CLAUDE_CODE_COORDINATOR_MODE === "1";
}

export function matchSessionMode(
  sessionMode: "coordinator" | "normal" | undefined
): string | undefined {
  if (!sessionMode) {
    return undefined;
  }

  const currentIsCoordinator = isCoordinatorMode();
  const sessionIsCoordinator = sessionMode === "coordinator";

  if (currentIsCoordinator === sessionIsCoordinator) {
    return undefined;
  }

  if (sessionIsCoordinator) {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = "1";
  } else {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE;
  }

  return sessionIsCoordinator
    ? "Entered coordinator mode to match resumed session."
    : "Exited coordinator mode to match resumed session.";
}

export function getWorkerToolsContext(
  mcpClients: ReadonlyArray<{ name: string }> = [],
  simpleMode: boolean = false
): string {
  const internalTools = new Set([
    "TeamCreate",
    "TeamDelete",
    "SendMessage",
    "TaskStop",
    "SyntheticOutput",
  ]);

  let workerTools: string[];
  if (simpleMode) {
    workerTools = ["Bash", "Read", "Edit"];
  } else {
    workerTools = getDefaultWorkerTools().filter(
      (name) => !internalTools.has(name)
    );
  }

  let content = `Workers spawned via the Agent tool have access to these tools: ${workerTools.sort().join(", ")}`;

  if (mcpClients.length > 0) {
    const serverNames = mcpClients.map((c) => c.name).join(", ");
    content += `\n\nWorkers also have access to MCP tools from connected MCP servers: ${serverNames}`;
  }

  return content;
}

export function getDefaultWorkerTools(): string[] {
  return [
    "Bash",
    "Read",
    "Edit",
    "Write",
    "Notebook",
    "Grep",
    "Glob",
    "WebSearch",
    "WebFetch",
    "TodoWrite",
    "Memory",
    "Agent",
    "TaskStop",
    "Skill",
  ];
}

export function getCoordinatorSystemPrompt(): string {
  const simpleMode = process.env.CLAUDE_CODE_SIMPLE === "1";
  const workerCapabilities = simpleMode
    ? "Workers have access to Bash, Read, and Edit tools, plus MCP tools from configured MCP servers."
    : "Workers have access to standard tools, MCP tools from configured MCP servers, and project skills via the Skill tool.";

  return `You are Claude Code, an AI assistant that orchestrates software engineering tasks across multiple workers.

## Your Role

You are a **coordinator**. Your job is to:
- Help the user achieve their goal
- Direct workers to research, implement and verify code changes
- Synthesize results and communicate with the user
- Answer questions directly when possible — don't delegate work that you can handle without tools

Every message you send is to the user. Worker results and system notifications are internal signals.

## Your Tools

- **Agent** - Spawn a new worker
- **SendMessage** - Continue an existing worker
- **TaskStop** - Stop a running worker

When calling Agent:
- Do not use one worker to check on another
- Do not use workers to trivially report file contents or run commands
- Continue workers whose work is complete to take advantage of their loaded context
- After launching agents, briefly tell the user what you launched

## Worker Results

Worker results arrive as user messages containing task notifications. They are not conversation partners.

${workerCapabilities}`;
}

export function createWorkerAgent(workerId: string): WorkerAgentConfig {
  return {
    agentType: "worker",
    tools: getDefaultWorkerTools().filter((name) => !INTERNAL_TOOLS.has(name)),
    systemPrompt: `You are a worker agent. Your job is to complete tasks thoroughly and report back.

Guidelines:
- Complete the task fully — don't leave it half-done
- Use tools proactively: read files, search code, run commands, edit files
- Be thorough in research
- For implementation: make targeted changes, run tests to verify
- Report back with actionable findings`,
    capabilities: [
      "research",
      "implementation",
      "verification",
      "testing",
    ],
  };
}

export function getSubAgentResult(
  agentId: string,
  messages: { role: string; content: string | unknown[] }[]
): SubAgentResult {
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const lastMessage = assistantMessages[assistantMessages.length - 1];

  let summary = "No summary available";
  if (typeof lastMessage?.content === "string") {
    summary = lastMessage.content.slice(0, 500);
  } else if (Array.isArray(lastMessage?.content)) {
    const textBlocks = lastMessage.content.filter(
      (c) => c !== null && typeof c === "object" && "text" in c
    );
    if (textBlocks.length > 0) {
      summary = String((textBlocks[0] as { text: string }).text).slice(0, 500);
    }
  }

  return {
    summary,
    touchedFiles: [],
    openQuestions: [],
  };
}
