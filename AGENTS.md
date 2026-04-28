# AGENTS.md

This file provides guidance to AI coding assistants when working on the openflow-cli codebase.

## Project Overview

OpenFlow CLI is a general-purpose AI agent framework with TUI interface, designed to be a coding assistant and general-purpose AI companion. The system features:

- **Universal Tool System**: Comprehensive tool suite for file operations, git, web, multimedia, and more
- **Agent System**: Multi-agent orchestration with sub-agents, planning, and verification
- **Memory System**: Enhanced memory with semantic search, knowledge graphs, and intent recognition
- **Checkpoint/Snapshot**: Transparent file protection with automatic snapshots before modifications
- **MCP Integration**: Model Context Protocol adapter for extending capabilities
- **Messaging Gateway**: Multi-platform support (Slack, Discord, Telegram, etc.)
- **Permission Governance**: Layered permission system with tool governance

## Development Environment

### Runtime Requirements

- **Runtime**: Bun (Node.js compatible)
- **TypeScript**: Strict mode enabled
- **UI Framework**: React + Ink (terminal UI)

### Quick Start

```bash
# Install dependencies
bun install

# Development mode (hot reload)
bun run dev

# Build for production
bun run build

# Type checking
bun run typecheck

# Run tests
bun test

# Lint & format
bun run lint
bun run format
```

### Project Structure

```
openflow-cli/
├── backend/                    # Core business logic (Bun/TypeScript)
│   ├── adapters/              # External system adapters (MCP, config, tools)
│   ├── agents/                # Agent system (coordinator, sub-agents, verification)
│   ├── bridge/                # Frontend-backend communication (WebSocket + RPC)
│   ├── checkpoints/           # File snapshot system for transparent protection
│   ├── commands/              # Command system (code review, development, undo)
│   ├── compaction/            # Context compaction (token budget, summarization)
│   ├── context/               # Context discovery (OPENFLOW.md loading)
│   ├── evolution/             # GEPA self-evolution system
│   ├── governance/            # Permission and tool governance pipeline
│   ├── hooks/                 # Plugin hook system
│   ├── llm/                   # LLM client, model routing, provider selection
│   ├── memory/                # Memory system (semantic search, knowledge graph)
│   ├── messaging/             # Messaging gateway (multi-platform adapters)
│   ├── permissions/           # Permission system (sandbox, bash analyzer)
│   ├── plugins/               # Plugin system (discovery, hot-reload, MCP server)
│   ├── prompts/              # System prompt building (dynamic layers)
│   ├── query/                 # Query engine (core agent loop)
│   ├── runtime/               # Runtime configuration (layered config, workflow)
│   ├── scheduler/            # Task scheduler and cron jobs
│   ├── serialization/         # Message serialization
│   ├── session/               # Session management
│   ├── skills/                # Built-in skills (code review, test generator, etc.)
│   ├── startup/               # Startup initialization and prefetch
│   ├── state/                 # Application state management
│   ├── telemetry/             # Health, logging, metrics
│   ├── token/                 # Token management and refresh
│   ├── tools/                 # Tool implementations (60+ tools)
│   ├── transport/             # Transport layer (WebSocket)
│   ├── types/                 # TypeScript type definitions
│   ├── utils/                 # Utilities (circuit breaker, retry, template)
│   ├── index.ts              # Main export barrel
│   ├── main.tsx              # Entry point
│   └── openflow-core.ts      # Core OpenFlow class
├── frontend/
│   └── tui/                   # Terminal UI (React + Ink)
│       ├── components/        # 100+ UI components
│       └── App.tsx           # Root component
├── .trae/
│   ├── rules/                # Editor rules (project_rules.md)
│   └── skills/              # Trae IDE skills
└── .openflow/               # Runtime configuration directory
```

---

## Architecture

### Core Loop

The main agent loop in `query/query-engine.ts`:
1. Receive user message
2. Build system prompt with context discovery
3. Send to LLM with tools
4. Handle tool calls
5. Execute with governance pipeline
6. Return response

### OpenFlowCore Class

Located at `backend/openflow-core.ts`, the `OpenFlowCore` class is the main orchestrator:

```typescript
// Key methods:
async executeToolWithGovernance(toolName, input, handler, toolContext)
async chat(message, context)
async prefetchTask()
```

### Tool System

Tools are defined in `backend/tools/` with the `defineTool` factory:

```typescript
import { defineTool } from "./tool-factory.js";

export function createFileTools() {
  return [
    defineTool({
      name: "read_file",
      description: "Read file contents...",
      inputSchema: ReadInputSchema,
      outputSchema: ReadOutputSchema,
      isReadOnly: true,
      handler: async (input) => { ... }
    }),
    // ...
  ];
}
```

**Key Tool Files:**
- `file-tools.ts` - Read, Write, Edit, Glob, Grep
- `bash-tools.ts` - Shell execution
- `git-tools.ts` - Git operations
- `web-tools.ts` - WebFetch, WebSearch
- `task-tools.ts` - Task management
- `cron-tools.ts` - Cron scheduling
- `checkpoint-tool.ts` - Snapshot management
- `clarify-tool.ts` - ask_clarification

**Tool Registration:**
- All tools exported from `backend/tools/index.ts`
- `BUILTIN_TOOL_NAMES` array lists all tool names
- `TOOL_GROUPS` defines tool categories
- `TOOL_PROFILES` defines tool profiles (coding, general, minimal)

### Agent System

Located in `backend/agents/`:

- `coordinator-mode.ts` - Main coordinator
- `sub-agent-system.ts` - Sub-agent execution
- `verification-agent.ts` - Plan verification
- `explore-agent.ts` - Exploration mode
- `plan-agent.ts` - Planning mode
- `swarm-mode.ts` - Swarm orchestration

### Memory System

Located in `backend/memory/enhanced-memory-core.ts`:

- Semantic search with HNSW index
- Knowledge graph with triple indexing
- Session memory management
- Intent recognition
- Exploration engine
- Kairos dreaming

### Checkpoint System

Located in `backend/checkpoints/`:

- `CheckpointSystem` - File-based snapshots
- `CheckpointManager` - Transparent file protection

**Key Features:**
- Automatic snapshot before file mutations
- Rollback to previous checkpoint
- Pruning old checkpoints (7 days retention)
- File count limits (10,000 files max)
- Exclusion patterns (node_modules, .git, dist, .env)

---

## Commands

Slash commands available in the CLI:

### Development Commands

```bash
/review [path]           # Code review
/format [path]           # Format code
/typecheck               # Type check
/test [pattern]          # Run tests
/analyze                 # Analyze project
/init                    # Initialize project
```

### Undo Commands

```bash
/checkpoint              # Create checkpoint
/checkpoints             # List checkpoints
/undo [n]                # Undo to checkpoint
/undo-last               # Undo last change
/diff                    # Show staged diff
/diff [ref]              # Show diff against ref
```

### Session Commands

```bash
/session                 # Session info
/sessions                # List sessions
/resume [id]             # Resume session
/compact                 # Compact context
```

---

## Adding New Tools

### 1. Define the Tool

Create or edit a tool file in `backend/tools/`:

```typescript
import { defineTool } from "./tool-factory.js";
import { z } from "zod";

const MyToolInputSchema = z.object({
  param: z.string().describe("Description of param"),
});

const MyToolOutputSchema = z.object({
  success: z.boolean(),
  data: z.string(),
});

export function createMyTools() {
  return [
    defineTool({
      name: "my_tool",
      description: "What this tool does...",
      inputSchema: MyToolInputSchema,
      outputSchema: MyToolOutputSchema,
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        // Implementation
        return { success: true, data: "result" };
      },
    }),
  ];
}
```

### 2. Register in Index

Update `backend/tools/index.ts`:

```typescript
import { createMyTools } from "./my-tools.js";

export const BUILTIN_TOOL_NAMES = [
  // ... existing tools
  "my_tool",  // Add here
];

// Optionally add to TOOL_GROUPS
export const TOOL_GROUPS: Record<string, string[]> = {
  // ...
  "group:my": ["my_tool"],
};
```

### 3. Add to System Prompt (if needed)

The tool manual registry in `backend/tools/tool-manual-registry.ts` provides detailed descriptions for the LLM.

---

## Adding New Skills

Skills are defined in `backend/skills/builtin-skills/<skill-name>/SKILL.md`:

```markdown
# Skill Name

## Description
Brief description of what this skill does.

## When to Use
- Scenario 1
- Scenario 2

## Implementation Notes
How to use this skill effectively.
```

---

## Testing

### Running Tests

```bash
bun test                    # Run all tests
bun test src/tools          # Run specific directory
bun test --coverage         # With coverage
```

### Test Conventions

- Use `bun:test` framework
- Colocate `*.test.ts` with source files
- Mock external dependencies
- Use Zod for input validation testing

---

## Code Conventions

### TypeScript

- **Strict mode**: All strict checks enabled
- **No `any`**: Use `unknown` + Zod validation
- **Type imports**: Use `import type` when only importing types
- **Zod everywhere**: All external data must be validated

### File Organization

- ESM modules with `.js` extension in imports
- Barrel exports in `index.ts`
- One major type/function per file
- Co-locate tests with source

### Naming

- **Files**: kebab-case (`my-tool.ts`)
- **Types/Classes**: PascalCase (`MyTool`)
- **Functions/Methods**: camelCase (`myFunction`)
- **Constants**: SCREAMING_SNAKE_CASE

### Zod Usage

Every type must have a corresponding Zod schema:

```typescript
export const MyTypeSchema = z.object({
  field: z.string(),
});

export type MyType = z.infer<typeof MyTypeSchema>;
```

---

## Configuration

### Runtime Config

Located in `backend/runtime/`:

- `layered-config.ts` - Layered configuration system
- `agent-config.ts` - Agent-specific settings
- `workflow-engine.ts` - Workflow configuration

### Environment Variables

```bash
OPENFLOW_LOG_LEVEL=debug|info|warn|error
OPENFLOW_SESSION_DIR=.openflow/sessions
OPENFLOW_CHECKPOINT_DIR=.openflow/checkpoints
```

### Permission Rules

Defined in `backend/permissions/rule-merger.ts`:
- Default: ask for dangerous operations
- Configurable via config files
- Bash commands analyzed before execution

---

## Key Files Reference

| Component | Main File |
|-----------|-----------|
| Core | `backend/openflow-core.ts` |
| Tools | `backend/tools/index.ts` |
| Agents | `backend/agents/index.ts` |
| Memory | `backend/memory/enhanced-memory-core.ts` |
| Query | `backend/query/query-engine.ts` |
| System Prompt | `backend/prompts/system-prompt.ts` |
| Checkpoint | `backend/checkpoints/checkpoint-manager.ts` |
| Skills | `backend/skills/skill-registry.ts` |

---

## Dependencies

```
frontend/tui → bridge → backend
backend ↛ frontend (no reverse dependencies)
```

---

## Git Workflow

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- Small, focused commits
- Test before push
- Run `bun run typecheck` before committing
