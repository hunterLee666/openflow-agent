export type ApiProvider = 'anthropic' | 'openai' | 'dashscope' | 'zhipu' | 'zhipuai' | 'deepseek' | 'minimax' | 'moonshot' | 'openrouter' | 'nvidia';

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  supportsStreaming: boolean;
  requiresThinkingFlag: boolean;
  defaultModel: string;
  supportedModels: string[];
  apiKeyPrefix?: string;
}

export const PROVIDER_CONFIGS: Record<ApiProvider, ProviderConfig> = {
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    supportsStreaming: true,
    requiresThinkingFlag: false,
    defaultModel: 'claude-sonnet-4-20250514',
    supportedModels: ['claude-opus-4-5*', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307'],
    apiKeyPrefix: 'sk-ant-',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    supportsStreaming: true,
    requiresThinkingFlag: false,
    defaultModel: 'gpt-4o',
    supportedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    apiKeyPrefix: 'sk-',
  },
  dashscope: {
    name: '阿里云百炼 (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    supportsStreaming: true,
    requiresThinkingFlag: true,
    defaultModel: 'qwen3-32b',
    supportedModels: ['qwen3-32b', 'qwen3-14b', 'qwen3-7b', 'qwen2.5-72b', 'qwen2.5-7b', 'qwen-plus', 'qwen-turbo', 'qwen-long'],
    apiKeyPrefix: 'sk-dashscope',
  },
  zhipu: {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    supportsStreaming: true,
    requiresThinkingFlag: false,
    defaultModel: 'glm-4',
    supportedModels: ['glm-4', 'glm-4-flash', 'glm-4-plus', 'glm-3-turbo'],
  },
  zhipuai: {
    name: '智谱 AI (ZhipuAI)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    supportsStreaming: true,
    requiresThinkingFlag: false,
    defaultModel: 'glm-4',
    supportedModels: ['glm-4', 'glm-4-flash', 'glm-4-plus', 'glm-3-turbo'],
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    supportsStreaming: true,
    requiresThinkingFlag: false,
    defaultModel: 'deepseek-chat',
    supportedModels: ['deepseek-chat', 'deepseek-coder'],
    apiKeyPrefix: 'sk-f',
  },
  minimax: {
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    supportsStreaming: true,
    requiresThinkingFlag: false,
    defaultModel: 'abab6.5s-chat',
    supportedModels: ['abab6.5s-chat', 'abab5.5s-chat'],
  },
  moonshot: {
    name: 'Moonshot (月之暗面)',
    baseUrl: 'https://api.moonshot.cn/v1',
    supportsStreaming: true,
    requiresThinkingFlag: false,
    defaultModel: 'moonshot-v1-8k',
    supportedModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    apiKeyPrefix: 'sk-',
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    supportsStreaming: true,
    requiresThinkingFlag: false,
    defaultModel: 'anthropic/claude-3.5-sonnet',
    supportedModels: [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      'openai/gpt-4o',
      'google/gemini-pro-1.5',
      'mistral/mistral-large',
      'meta-llama/llama-3-70b-instruct',
      'deepseek/deepseek-coder-v2',
    ],
    apiKeyPrefix: 'sk-or-',
  },
  nvidia: {
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    supportsStreaming: true,
    requiresThinkingFlag: false,
    defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
    supportedModels: [
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'nvidia/llama-3.1-nemotron-8b-instruct',
      'nvidia/llama-3.1-nemotron-4b-instruct',
      'mistralai/mixtral-8x22b-instruct-v0.1',
      'google/gemma-2-27b-it',
    ],
    apiKeyPrefix: 'nvapi-',
  },
};

export function getProviderConfig(provider: ApiProvider): ProviderConfig {
  return PROVIDER_CONFIGS[provider];
}

export function resolveProvider(apiKey?: string, envProvider?: string): ApiProvider {
  if (envProvider && envProvider in PROVIDER_CONFIGS) {
    return envProvider as ApiProvider;
  }

  if (apiKey) {
    if (apiKey.startsWith('sk-ant-')) {
      return 'anthropic';
    }
    if (apiKey.startsWith('sk-dashscope')) {
      return 'dashscope';
    }
    if (apiKey.startsWith('sk-or-')) {
      return 'openrouter';
    }
    if (apiKey.startsWith('nvapi-')) {
      return 'nvidia';
    }
    if (apiKey.startsWith('sk-')) {
      return 'openai';
    }
    if (apiKey.startsWith('sk-f')) {
      return 'deepseek';
    }
  }

  return 'anthropic';
}
