import type { Message } from '../types/index.js';
import type { AgentConfig } from '../types/index.js';

export interface CacheSafeParams {
  systemPrompt: string;
  userContext: Record<string, string>;
  systemContext: Record<string, string>;
  tools: unknown[];
  model?: string;
  maxOutputTokens?: number;
  forkContextMessages: Message[];
}

export interface ForkedAgentParams {
  promptMessages: Message[];
  cacheSafeParams: CacheSafeParams;
  forkLabel: string;
  querySource?: string;
  maxOutputTokens?: number;
  maxTurns?: number;
  onMessage?: (message: Message) => void;
  skipTranscript?: boolean;
  skipCacheWrite?: boolean;
  sessionId?: string;
  agentId?: string;
}

export interface ForkedAgentResult {
  messages: Message[];
  totalUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheHits?: number;
    cacheWrites?: number;
  };
  durationMs: number;
}

let lastCacheSafeParams: CacheSafeParams | null = null;

export function saveCacheSafeParams(params: CacheSafeParams | null): void {
  lastCacheSafeParams = params;
}

export function getLastCacheSafeParams(): CacheSafeParams | null {
  return lastCacheSafeParams;
}

export function createCacheSafeParams(
  systemPrompt: string,
  userContext: Record<string, string>,
  systemContext: Record<string, string>,
  tools: unknown[],
  forkContextMessages: Message[],
  options?: {
    model?: string;
    maxOutputTokens?: number;
  }
): CacheSafeParams {
  return {
    systemPrompt,
    userContext,
    systemContext,
    tools,
    model: options?.model,
    maxOutputTokens: options?.maxOutputTokens,
    forkContextMessages,
  };
}

export interface SubagentContextOverrides {
  getAppState?: () => unknown;
  allowedTools?: string[];
}

export async function runForkedAgent(
  params: ForkedAgentParams,
  config: {
    executeQuery: (messages: Message[], options?: Partial<AgentConfig>) => Promise<ForkedAgentResult>;
  }
): Promise<ForkedAgentResult> {
  const startTime = Date.now();

  saveCacheSafeParams(params.cacheSafeParams);

  const allMessages = [
    ...params.cacheSafeParams.forkContextMessages,
    ...params.promptMessages,
  ];

  try {
    const result = await config.executeQuery(allMessages, {
      systemPrompt: params.cacheSafeParams.systemPrompt,
      model: params.cacheSafeParams.model,
      maxOutputTokens: params.maxOutputTokens ?? params.cacheSafeParams.maxOutputTokens,
      maxTurns: params.maxTurns,
    });

    return {
      ...result,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      messages: [],
      totalUsage: {
        inputTokens: 0,
        outputTokens: 0,
      },
      durationMs: Date.now() - startTime,
    };
  }
}

export function createGetAppStateWithAllowedTools(
  baseGetAppState: () => unknown,
  allowedTools: string[]
): () => unknown {
  return () => {
    const state = baseGetAppState();
    if (state && typeof state === 'object') {
      const stateObj = state as Record<string, unknown>;
      if ('permissions' in stateObj && stateObj.permissions) {
        return {
          ...stateObj,
          permissions: {
            ...(stateObj.permissions as Record<string, unknown>),
            allowedTools,
          },
        };
      }
    }
    return state;
  };
}
