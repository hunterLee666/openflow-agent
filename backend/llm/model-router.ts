import type { ProviderConfig, TaskComplexity, ModelRouteCandidate, ModelRouteResult } from "./types.js";

export type { TaskComplexity, ModelRouteCandidate, ModelRouteResult };

export function analyzeTaskComplexity(prompt: string): TaskComplexity {
  const lowerPrompt = prompt.toLowerCase();
  const promptLength = prompt.length;

  const codeKeywords = ["function", "class", "import", "export", "const", "let", "var", "async", "await"];
  const reasoningKeywords = ["analyze", "explain", "why", "how", "compare", "evaluate", "reason"];
  const creativeKeywords = ["write", "create", "design", "generate", "story", "poem", "song"];

  let codeScore = 0;
  let reasoningScore = 0;
  let creativeScore = 0;

  for (const keyword of codeKeywords) {
    if (lowerPrompt.includes(keyword)) codeScore++;
  }
  for (const keyword of reasoningKeywords) {
    if (lowerPrompt.includes(keyword)) reasoningScore++;
  }
  for (const keyword of creativeKeywords) {
    if (lowerPrompt.includes(keyword)) creativeScore++;
  }

  const maxScore = Math.max(codeScore, reasoningScore, creativeScore);

  let type: TaskComplexity["type"];
  if (promptLength < 100 && maxScore <= 1) {
    type = "simple";
  } else if (promptLength < 500 && maxScore <= 3) {
    type = "medium";
  } else if (promptLength < 2000 && maxScore <= 5) {
    type = "complex";
  } else {
    type = "expert";
  }

  const estimatedTokens = Math.ceil(promptLength / 4);

  return {
    type,
    estimatedTokens,
    requiresReasoning: reasoningScore >= 2,
    requiresCreativity: creativeScore >= 2,
    requiresCodeGeneration: codeScore >= 2,
  };
}

function calculateCandidateScore(
  provider: ProviderConfig,
  complexity: TaskComplexity,
  preferredProvider?: string
): number {
  let score = 0;

  if (preferredProvider && provider.name === preferredProvider) {
    score += 100;
  }

  const priority = provider.priority || 1;
  score += priority * 10;

  const weight = provider.weight || 1;
  score += weight * 5;

  if (complexity.type === "expert" && (provider.contextWindow || 0) >= 200000) {
    score += 50;
  } else if (complexity.type === "complex" && (provider.contextWindow || 0) >= 100000) {
    score += 40;
  } else if (complexity.type === "simple" && (provider.costPer1kOutput || 0) < 0.005) {
    score += 30;
  }

  if (complexity.requiresCodeGeneration) {
    const hasCodeModel = provider.supportedModels.some(
      (m) => m.toLowerCase().includes("coder") || m.toLowerCase().includes("code")
    );
    if (hasCodeModel) score += 25;
  }

  if (complexity.requiresCreativity) {
    const isAnthropic = provider.name.toLowerCase().includes("anthropic");
    if (isAnthropic) score += 20;
  }

  if (provider.costPer1kOutput) {
    score += Math.max(0, 20 - provider.costPer1kOutput * 1000);
  }

  return score;
}

export function routeToModel(
  prompt: string,
  providers: Record<string, ProviderConfig>,
  config: { preferredProvider?: string; maxCandidates?: number } = {}
): ModelRouteResult {
  const complexity = analyzeTaskComplexity(prompt);
  const providerKeys = Object.keys(providers);

  if (providerKeys.length === 0) {
    throw new Error("No providers configured");
  }

  const candidates: ModelRouteCandidate[] = [];

  for (const [key, provider] of Object.entries(providers)) {
    const score = calculateCandidateScore(provider, complexity, config.preferredProvider);

    const estimatedCost = (complexity.estimatedTokens / 1000) * (provider.costPer1kOutput || 0.01);
    const estimatedLatencyMs = complexity.type === "simple" ? 500 :
      complexity.type === "medium" ? 1000 : 2000;

    candidates.push({
      provider: key,
      model: provider.defaultModel,
      reason: `Score: ${score.toFixed(0)}`,
      estimatedCost,
      estimatedLatencyMs,
      score,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const maxCandidates = config.maxCandidates || 3;
  const topCandidates = candidates.slice(0, maxCandidates);

  const selected = topCandidates[0];

  return {
    candidates: topCandidates,
    selectedProvider: selected.provider,
    selectedModel: selected.model,
    reason: selected.reason,
    isFallback: false,
  };
}

export class ModelRouter {
  private providers: Record<string, ProviderConfig>;
  private preferredProvider: string | null = null;
  private maxCandidates: number;

  constructor(
    providers: Record<string, ProviderConfig>,
    config: { preferredProvider?: string; maxCandidates?: number } = {}
  ) {
    this.providers = providers;
    this.preferredProvider = config.preferredProvider || null;
    this.maxCandidates = config.maxCandidates || 3;
  }

  route(prompt: string, overrides?: { preferredProvider?: string }): ModelRouteResult {
    return routeToModel(prompt, this.providers, {
      preferredProvider: overrides?.preferredProvider || this.preferredProvider || undefined,
      maxCandidates: this.maxCandidates,
    });
  }

  getCandidates(prompt: string, limit?: number): ModelRouteCandidate[] {
    const result = this.route(prompt);
    return result.candidates.slice(0, limit || this.maxCandidates);
  }

  getBestProvider(prompt: string): { provider: string; model: string } {
    const result = this.route(prompt);
    return {
      provider: result.selectedProvider,
      model: result.selectedModel,
    };
  }

  setPreferredProvider(provider: string): void {
    if (!this.providers[provider]) {
      throw new Error(`Provider "${provider}" not found`);
    }
    this.preferredProvider = provider;
  }

  getProviders(): Record<string, ProviderConfig> {
    return { ...this.providers };
  }

  addProvider(key: string, config: ProviderConfig): void {
    this.providers[key] = config;
  }

  removeProvider(key: string): void {
    delete this.providers[key];
    if (this.preferredProvider === key) {
      this.preferredProvider = null;
    }
  }
}
