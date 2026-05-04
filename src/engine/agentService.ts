import { Agent, getAllBaseTools } from '@codeany/open-agent-sdk';
import { getGlobalConfig } from '../utils/config';
import { getSystemPrompt } from '../constants/prompts';
import { randomUUID } from 'crypto';

// Import OpenFlow tool descriptions (to be created)
// For now we define a simple mapping inline

const TOOL_DESCRIPTIONS: Record<string, { description: string; prompt: string }> = {
  Read: {
    description: 'Read a file from the filesystem. Returns content with line numbers. Supports text files, images (returns visual content), and PDFs.',
    prompt: `You have access to a Read tool that can read files. Use it to examine file contents. Always specify the file_path relative to project root.`,
  },
  Bash: {
    description: 'Execute a bash command and return its output. Use for running shell commands, scripts, and system operations.',
    prompt: `You have access to a Bash tool to run shell commands. Commands run in a restricted sandbox. Only run safe, non-interactive commands. Avoid destructive operations without explicit user confirmation.`,
  },
  Write: {
    description: 'Write content to a file. Creates the file if it does not exist, or overwrites if it does. Creates parent directories as needed.',
    prompt: `You have access to a Write tool to create or overwrite files. Use with caution. Always ensure the file_path is correct.`,
  },
  Edit: {
    description: 'Perform exact string replacements in files. The old_string must match exactly (including whitespace and indentation). Use replace_all to change every occurrence.',
    prompt: `You have access to an Edit tool to make precise changes. Provide enough context in old_string to uniquely identify the location.`,
  },
  Glob: {
    description: 'Find files matching a glob pattern. Returns matching file paths sorted by modification time. Supports patterns like "**/*.ts", "src/**/*.js".',
    prompt: `You have access to a Glob tool to search for files by pattern. Use it to locate files efficiently.`,
  },
  Grep: {
    description: 'Search file contents using regex patterns. Uses ripgrep (rg) if available, falls back to grep. Supports file type filtering and context lines.',
    prompt: `You have access to a Grep tool to search file contents. Provide a valid regex pattern.`,
  },
  // Add others as needed...
};

export class AgentService {
  private agent: Agent | null = null;
  private config: {
    model: string;
    apiKey?: string;
    baseURL?: string;
    maxTokens?: number;
    maxTurns?: number;
    maxBudgetUsd?: number;
    permissionMode: string;
    safeMode?: boolean;
  };

  constructor(config: { model?: string; apiKey?: string; baseURL?: string; safeMode?: boolean } = {}) {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('[AgentService] No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
    }

    let model = config.model;
    if (!model) {
      const globalCfg = getGlobalConfig();
      model = globalCfg.model;
    }
    if (!model) {
      model = process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL;
    }

    this.config = {
      model,
      apiKey,
      baseURL: config.baseURL || process.env.ANTHROPIC_BASE_URL || process.env.OPENAI_BASE_URL,
      maxTokens: 16384,
      maxTurns: 50,
      permissionMode: 'bypassPermissions',
      safeMode: config.safeMode,
    };
  }

  async initialize(): Promise<void> {
    if (this.agent) return;

    try {
      if (!this.config.model) {
        throw new Error('No model configured. Set model via environment variable (OPENAI_MODEL or ANTHROPIC_MODEL).');
      }
      const baseTools = getAllBaseTools();

      // Customize tool descriptions and prompts from OpenFlow definitions
      for (const tool of baseTools) {
        const name = tool.name;
        if (TOOL_DESCRIPTIONS[name]) {
          // Override description and prompt (if tool has a prompt method)
          tool.description = TOOL_DESCRIPTIONS[name].description;
          // Some tools may have a .prompt property; we replace it with a simple async function returning our custom prompt
          if (typeof tool.prompt === 'function') {
            tool.prompt = async () => TOOL_DESCRIPTIONS[name].prompt;
          }
        }
      }

      const agentConfig: any = {
        model: this.config.model,
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        maxTokens: this.config.maxTokens,
        maxBudgetUsd: this.config.maxBudgetUsd,
        permissionMode: this.config.permissionMode,
        tools: baseTools,
        apiType: 'openai-completions',
      };
      agentConfig.maxTurns = this.config.maxTurns;
      agentConfig.max_turns = this.config.maxTurns;

      const systemPrompt = await getSystemPrompt();
      agentConfig.system = systemPrompt;
      agentConfig.systemPrompt = systemPrompt;

      this.agent = new Agent(agentConfig);
    } catch (e: any) {
      console.error('[AgentService] Failed to create Agent:', e.message || e);
      throw e;
    }
  }

  async *query(prompt: string): AsyncGenerator<any, void, unknown> {
    await this.initialize();
    if (!this.agent) {
      yield this.createAssistantErrorMessage('Agent not initialized');
      return;
    }
    if (!this.config.apiKey) {
      yield this.createAssistantErrorMessage('No API key provided. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.');
      return;
    }


    let hasAssistantText = false;
    let eventCount = 0;
    let lastToolResult: any = null;

    try {
      for await (const ev of this.agent.query(prompt)) {
        eventCount++;
        console.log('[AgentService] event:', ev.type);

        if (ev.type === 'result') {
          if (ev.is_error === true) {
            const errObj = ev as any;
            let errorMsg = 'An error occurred during execution';
            if (ev.subtype === 'error_max_turns') {
              errorMsg = 'Maximum turns exceeded';
            } else if (ev.subtype === 'error_max_budget_usd') {
              errorMsg = 'Maximum budget exceeded';
            } else if (errObj.errors && Array.isArray(errObj.errors) && errObj.errors.length > 0) {
              errorMsg = errObj.errors.join('; ');
            } else if (errObj.result && typeof errObj.result === 'string' && errObj.result.length > 0) {
              errorMsg = errObj.result;
            } else if (errObj.error) {
              errorMsg = typeof errObj.error === 'string' ? errObj.error : JSON.stringify(errObj.error);
            }
            console.error('[AgentService] Agent error:', errorMsg);
            yield this.createAssistantErrorMessage(errorMsg);
          } else if (ev.result && typeof ev.result === 'string' && ev.result.length > 0) {
            yield {
              type: 'assistant',
              message: {
                id: `result-${randomUUID()}`,
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: ev.result }],
                model: this.config.model,
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: ev.usage || { input_tokens: 0, output_tokens: 0 },
              },
              uuid: randomUUID(),
              costUSD: ev.total_cost_usd || ev.cost || 0,
              durationMs: ev.duration_ms || 0,
            };
            hasAssistantText = true;
          }
          continue;
        } else if (ev.type === 'error') {
          const errorMsg = ev.message || ev.msg || 'An unknown error occurred';
          console.error('[AgentService] Agent error:', errorMsg);
          yield this.createAssistantErrorMessage(errorMsg);
        } else if (ev.type === 'assistant') {
          const content = ev.message?.content || [];
          const hasText = content.some((c: any) => c.type === 'text' && c.text && c.text.trim().length > 0);
          if (hasText) {
            hasAssistantText = true;
          }
          yield ev;
        } else if (ev.type === 'tool_result') {
          const result = ev.result;
          if (!result || result.output === undefined) {
            console.error('[AgentService] Invalid tool_result:', ev);
            continue;
          }
          lastToolResult = ev;
          const output = result.output;
          const content = typeof output === 'string' ? output : JSON.stringify(output);
          yield {
            type: 'user',
            message: {
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: result.tool_use_id, content, is_error: result.is_error }],
              toolUseResult: { data: output, isError: result.is_error },
            },
            uuid: randomUUID(),
          };
        } else {
          console.debug('[AgentService] Ignoring event:', ev.type);
        }
      }
    } catch (e: any) {
      console.error('[AgentService] Query error:', e.message || e);
      yield this.createAssistantErrorMessage(e.message || String(e));
    }

    console.log('[AgentService] query ended. eventCount:', eventCount, 'hasAssistantText:', hasAssistantText);
    if (!hasAssistantText && eventCount > 0) {
      // Generate summary based on last tool result if available
      let summary = 'The command executed successfully. Output displayed above.';
      if (lastToolResult) {
        const result = lastToolResult.result;
        const toolName = result.tool_name;
        if (toolName === 'Read') {
          const lines = (result.output || '').split('\n').length;
          summary = `Read ${lines} lines from file.`;
        } else if (toolName === 'Bash') {
          summary = 'Command finished.';
        } else if (toolName === 'Glob' || toolName === 'Grep') {
          const count = (result.output || '').split('\n').filter(l => l.trim() !== '').length;
          summary = `Found ${count} items.`;
        }
      }
      yield {
        type: 'assistant',
        message: {
          id: `summary-${randomUUID()}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: summary }],
          model: this.config.model,
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
        uuid: randomUUID(),
        costUSD: 0,
        durationMs: 0,
      };
    }
  }

  async prompt(text: string): Promise<{ text: string }> {
    await this.initialize();
    if (!this.agent) return { text: '' };
    return this.agent.prompt(text);
  }

  async interrupt(): Promise<void> {
    this.agent?.interrupt();
  }

  clear(): void {
    this.agent?.clear();
  }

  private createAssistantErrorMessage(text: string): any {
    return {
      type: 'assistant',
      message: {
        id: `error-${randomUUID()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: `Error: ${text}` }],
        model: 'n/a',
        stop_reason: 'error',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      uuid: randomUUID(),
      costUSD: 0,
      durationMs: 0,
    };
  }
}

let globalAgent: AgentService | null = null;

export function getAgentService(): AgentService {
  if (!globalAgent) {
    globalAgent = new AgentService();
  }
  return globalAgent;
}
