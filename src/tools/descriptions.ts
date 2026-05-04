// Tool descriptions for UI rendering
// Maps tool names to user-facing descriptions and render helpers

const defaultDescriptions: Record<string, {
  userFacingName?: (input?: any) => string;
  renderToolUseMessage?: (input: any, options?: { verbose?: boolean }) => string;
  renderToolUseRejectedMessage?: () => string;
  renderToolResultMessage?: (output: any, options?: { verbose?: boolean }) => string;
}> = {};

export function getToolDescription(toolName: string) {
  return defaultDescriptions[toolName];
}

export function registerToolDescription(toolName: string, desc: any) {
  defaultDescriptions[toolName] = desc;
}

// Install descriptions for all tools (call once during startup)
export function installDefaultToolDescriptions() {
  // Bash
  registerToolDescription('Bash', {
    userFacingName: (input?) => `Run shell command: ${input?.command || '...'}`,
    renderToolUseMessage: (input, options) => {
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\``;
      return `bash: ${input.command}`;
    },
    renderToolUseRejectedMessage: () => '❌ Bash command not executed.',
    renderToolResultMessage: (output, options) => {
      if (typeof output === 'string') return output;
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\``;
      return 'Bash command completed.';
    },
  });

  // Read
  registerToolDescription('Read', {
    userFacingName: (input?) => `Read file: ${input?.file_path || '...'}`,
    renderToolUseMessage: (input, options) => {
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\``;
      return `read: ${input.file_path}`;
    },
    renderToolUseRejectedMessage: () => '❌ File read not executed.',
    renderToolResultMessage: (output, options) => {
      if (typeof output === 'string') return output;
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\``;
      return 'File read completed.';
    },
  });

  // Edit
  registerToolDescription('Edit', {
    userFacingName: (input?) => `Edit file: ${input?.file_path || '...'}`,
    renderToolUseMessage: (input, options) => {
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\``;
      return `edit: ${input.file_path}`;
    },
    renderToolUseRejectedMessage: () => '❌ File edit not executed.',
    renderToolResultMessage: (output, options) => {
      if (typeof output === 'string') return output;
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\``;
      return 'File edit completed.';
    },
  });

  // Write
  registerToolDescription('Write', {
    userFacingName: (input?) => `Write file: ${input?.file_path || '...'}`,
    renderToolUseMessage: (input, options) => {
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\``;
      return `write: ${input.file_path}`;
    },
    renderToolUseRejectedMessage: () => '❌ File write not executed.',
    renderToolResultMessage: (output, options) => {
      if (typeof output === 'string') return output;
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\``;
      return 'File write completed.';
    },
  });

  // Task (subagent)
  registerToolDescription('Task', {
    userFacingName: (input?) => `Delegate task: ${input?.subagent_type || '...'}`,
    renderToolUseMessage: (input, options) => {
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\``;
      return `task: ${input.subagent_type}`;
    },
    renderToolUseRejectedMessage: () => '❌ Task not executed.',
    renderToolResultMessage: (output, options) => {
      if (typeof output === 'string') return output;
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\``;
      return 'Task completed.';
    },
  });

  // WebFetch
  registerToolDescription('WebFetch', {
    userFacingName: (input?) => `Fetch URL: ${input?.url || '...'}`,
    renderToolUseMessage: (input, options) => {
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\``;
      return `fetch: ${input.url}`;
    },
    renderToolUseRejectedMessage: () => '❌ Web fetch not executed.',
    renderToolResultMessage: (output, options) => {
      if (typeof output === 'string') return output;
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\``;
      return 'Web fetch completed.';
    },
  });

  // MCP
  registerToolDescription('MCP', {
    userFacingName: (input?) => `Call MCP: ${input?.server || '...'}.${input?.tool || '...'}`,
    renderToolUseMessage: (input, options) => {
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\``;
      return `mcp: ${input.server}.${input.tool}`;
    },
    renderToolUseRejectedMessage: () => '❌ MCP call not executed.',
    renderToolResultMessage: (output, options) => {
      if (typeof output === 'string') return output;
      if (options?.verbose) return `\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\``;
      return 'MCP call completed.';
    },
  });

  // TODO: add more tools as needed (Glob, Grep, LSP, etc.)
}
