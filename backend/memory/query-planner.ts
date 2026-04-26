import { z } from 'zod';
import type { SearchResult } from './triple-index.js';
import type { MemoryUnit } from './semantic-compressor.js';
import type { IntentRecognitionResult, Entity as IntentEntity } from './intent-recognizer.js';

export const QueryComplexity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

export const QueryComplexitySchema = z.enum(['low', 'medium', 'high']);

export type QueryComplexity = (typeof QueryComplexity)[keyof typeof QueryComplexity];

export const RetrievalPlanSchema = z.object({
  query: z.string(),
  complexity: QueryComplexitySchema,
  retrievalDepth: z.number(),
  enableSemanticSearch: z.boolean(),
  enableLexicalSearch: z.boolean(),
  enableSymbolicFilter: z.boolean(),
  enableReflection: z.boolean(),
  intentResult: z.any().optional(),
  filters: z.object({
    entities: z.array(z.string()).optional(),
    timeRange: z.object({ start: z.string(), end: z.string() }).optional(),
    sourceType: z.string().optional(),
    minSalience: z.number().optional(),
    intentType: z.string().optional(),
    knowledgeGraph: z.boolean().optional(),
  }).optional(),
});

export type RetrievalPlan = z.infer<typeof RetrievalPlanSchema>;

export const QueryAnalysisSchema = z.object({
  originalQuery: z.string(),
  complexity: QueryComplexitySchema,
  extractedEntities: z.array(z.string()),
  extractedTimeRange: z.object({ start: z.string(), end: z.string() }).optional(),
  intentType: z.enum(['fact_lookup', 'aggregation', 'temporal', 'preference', 'experience']),
  intentResult: z.any().optional(),
});

export type QueryAnalysis = z.infer<typeof QueryAnalysisSchema>;

export const RetrievalConfigSchema = z.object({
  lowDepth: z.number(),
  mediumDepth: z.number(),
  highDepth: z.number(),
  enableParallelRetrieval: z.boolean(),
  maxParallelWorkers: z.number(),
});

export type RetrievalConfig = z.infer<typeof RetrievalConfigSchema>;

const DEFAULT_CONFIG: RetrievalConfig = {
  lowDepth: 3,
  mediumDepth: 10,
  highDepth: 20,
  enableParallelRetrieval: true,
  maxParallelWorkers: 4,
};

export class QueryPlanner {
  private config: RetrievalConfig;
  private intentRecognizer: any;

  constructor(config?: Partial<RetrievalConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setIntentRecognizer(recognizer: any): void {
    this.intentRecognizer = recognizer;
  }

  async analyzeQuery(query: string, intentResult?: IntentRecognitionResult): Promise<QueryAnalysis> {
    const complexity = await this.estimateComplexity(query);
    const entities = this.extractEntities(query);
    const timeRange = this.extractTimeRange(query);
    const intentType = this.inferIntentType(query);

    return {
      originalQuery: query,
      complexity,
      extractedEntities: entities,
      extractedTimeRange: timeRange,
      intentType,
      intentResult,
    };
  }

  async estimateComplexity(query: string): Promise<QueryComplexity> {
    const lowerQuery = query.toLowerCase();

    const complexIndicators = [
      'all', 'every', 'each', 'list', 'summary', 'compare',
      'trend', 'pattern', 'history', 'timeline', 'evolution',
      'how often', 'how many', 'how much', 'when did', 'who',
      'why', 'what happened', 'describe', 'explain',
    ];

    let complexityScore = 0;

    for (const indicator of complexIndicators) {
      if (lowerQuery.includes(indicator)) {
        complexityScore++;
      }
    }

    const questionWords = (lowerQuery.match(/\b(what|when|where|who|why|how)\b/g) || []).length;
    complexityScore += questionWords;

    const wordCount = query.split(/\s+/).length;
    if (wordCount > 15) complexityScore++;
    if (wordCount > 25) complexityScore++;

    if (complexityScore <= 1) return QueryComplexity.LOW;
    if (complexityScore <= 3) return QueryComplexity.MEDIUM;
    return QueryComplexity.HIGH;
  }

  async generateRetrievalPlan(query: string, intentResult?: IntentRecognitionResult): Promise<RetrievalPlan> {
    const analysis = await this.analyzeQuery(query, intentResult);

    let depth: number;
    switch (analysis.complexity) {
      case QueryComplexity.LOW:
        depth = this.config.lowDepth;
        break;
      case QueryComplexity.MEDIUM:
        depth = this.config.mediumDepth;
        break;
      case QueryComplexity.HIGH:
        depth = this.config.highDepth;
        break;
    }

    const enableReflection = analysis.complexity === QueryComplexity.HIGH;

    const intentFilters: Record<string, unknown> = {};
    if (intentResult) {
      intentFilters.intentType = intentResult.primaryIntent;
      intentFilters.knowledgeGraph = intentResult.metadata.entities.length > 0;
    }

    return {
      query,
      complexity: analysis.complexity,
      retrievalDepth: depth,
      enableSemanticSearch: true,
      enableLexicalSearch: true,
      enableSymbolicFilter: analysis.extractedEntities.length > 0 || analysis.extractedTimeRange !== undefined,
      enableReflection,
      intentResult,
      filters: {
        entities: analysis.extractedEntities.length > 0 ? analysis.extractedEntities : undefined,
        timeRange: analysis.extractedTimeRange,
        ...intentFilters,
      },
    };
  }

  async executeRetrieval(
    plan: RetrievalPlan,
    searchFn: (query: string, filters?: RetrievalPlan['filters'], topK?: number) => Promise<SearchResult[]>
  ): Promise<SearchResult[]> {
    const results = await searchFn(plan.query, plan.filters, plan.retrievalDepth);

    if (plan.enableReflection && results.length > 0) {
      const reflectedResults = await this.reflectOnResults(plan.query, results);
      return reflectedResults;
    }

    return results;
  }

  private async reflectOnResults(query: string, results: SearchResult[]): Promise<SearchResult[]> {
    const topResults = results.slice(0, 5);

    const reflectionPrompt = `Based on the query "${query}" and the following retrieved context, identify any gaps or additional information needed:\n\n${topResults.map((r) => r.content).join('\n\n')}`;

    return results;
  }

  private extractEntities(query: string): string[] {
    const entities: string[] = [];

    const namePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
    const names = query.match(namePattern);
    if (names) {
      entities.push(...names);
    }

    const datePattern = /\b\d{4}-\d{2}-\d{2}\b/g;
    const dates = query.match(datePattern);
    if (dates) {
      entities.push(...dates);
    }

    const quotedPattern = /"([^"]+)"/g;
    let match;
    while ((match = quotedPattern.exec(query)) !== null) {
      entities.push(match[1]);
    }

    return [...new Set(entities)];
  }

  private extractTimeRange(query: string): { start: string; end: string } | undefined {
    const lowerQuery = query.toLowerCase();

    const now = new Date();

    if (lowerQuery.includes('last week') || lowerQuery.includes('past week')) {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      return { start, end: now.toISOString() };
    }

    if (lowerQuery.includes('last month') || lowerQuery.includes('past month')) {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      return { start, end: now.toISOString() };
    }

    if (lowerQuery.includes('last year') || lowerQuery.includes('past year')) {
      const start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
      return { start, end: now.toISOString() };
    }

    const datePattern = /\b(\d{4}-\d{2}-\d{2})\b/g;
    const dates = query.match(datePattern);
    if (dates && dates.length >= 2) {
      return { start: dates[0], end: dates[dates.length - 1] };
    }

    return undefined;
  }

  private inferIntentType(query: string): QueryAnalysis['intentType'] {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('prefer') || lowerQuery.includes('like') || lowerQuery.includes('favorite')) {
      return 'preference';
    }

    if (lowerQuery.includes('experience') || lowerQuery.includes('learned') || lowerQuery.includes('discovered')) {
      return 'experience';
    }

    if (lowerQuery.includes('when') || lowerQuery.includes('time') || lowerQuery.includes('date')) {
      return 'temporal';
    }

    if (lowerQuery.includes('all') || lowerQuery.includes('list') || lowerQuery.includes('summary') || lowerQuery.includes('compare')) {
      return 'aggregation';
    }

    return 'fact_lookup';
  }

  getComplexityDistribution(queries: string[]): Record<QueryComplexity, number> {
    const distribution = {
      [QueryComplexity.LOW]: 0,
      [QueryComplexity.MEDIUM]: 0,
      [QueryComplexity.HIGH]: 0,
    };

    for (const query of queries) {
      const complexity = this.estimateComplexitySync(query);
      distribution[complexity]++;
    }

    return distribution;
  }

  private estimateComplexitySync(query: string): QueryComplexity {
    const lowerQuery = query.toLowerCase();

    const complexIndicators = [
      'all', 'every', 'each', 'list', 'summary', 'compare',
      'trend', 'pattern', 'history', 'timeline', 'evolution',
      'how often', 'how many', 'how much', 'when did', 'who',
      'why', 'what happened', 'describe', 'explain',
    ];

    let complexityScore = 0;

    for (const indicator of complexIndicators) {
      if (lowerQuery.includes(indicator)) {
        complexityScore++;
      }
    }

    const questionWords = (lowerQuery.match(/\b(what|when|where|who|why|how)\b/g) || []).length;
    complexityScore += questionWords;

    const wordCount = query.split(/\s+/).length;
    if (wordCount > 15) complexityScore++;
    if (wordCount > 25) complexityScore++;

    if (complexityScore <= 1) return QueryComplexity.LOW;
    if (complexityScore <= 3) return QueryComplexity.MEDIUM;
    return QueryComplexity.HIGH;
  }
}

export function createQueryPlanner(config?: Partial<RetrievalConfig>): QueryPlanner {
  return new QueryPlanner(config);
}
