export interface ToolUseConfirm {
  tool: { name: string };
  input: any;
  description?: string;
  commandPrefix?: any;
  toolUseContext: {
    abortController: AbortController;
    conversationKey?: string;
    options?: any;
    readFileTimestamps?: Record<string, number>;
  };
  suggestions?: any[];
  riskScore: any;
  assistantMessage?: any;
  onDone: () => void;
  onAllow: (type: 'once' | 'permanent') => void;
  onAbort: () => void;
}
