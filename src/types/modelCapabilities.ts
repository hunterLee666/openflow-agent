// Model capabilities types for simplified mode
export type ModelCapability = 'text' | 'vision' | 'toolUse' | 'streaming' | 'structuredOutput';

export interface UnifiedRequestParams {
  prompt?: string;
  messages?: Array<{ role: string; content: any }>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  safetySettings?: any[];
  [key: string]: any;
}

export interface UnifiedResponse {
  content: Array<{ type: string; text?: string; toolUse?: any }>;
  stopReason?: string;
  usage?: { inputTokens: number; outputTokens: number };
  [key: string]: any;
}

export interface ReasoningStreamingContext {
  reasoningEnabled: boolean;
  reasoningTokens: number;
  [key: string]: any;
}

// Additional for compatibility
export interface ModelCapabilities {
  capabilities: ModelCapability[];
  maxTokens: number;
  contextLength: number;
  supportsVision: boolean;
  supportsTools: boolean;
  streaming: boolean;
}
