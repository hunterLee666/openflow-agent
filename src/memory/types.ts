export interface MemoryCard {
  id: string;
  title: string;
  description: string;
  scope: string;
  createdAt: Date;
  updatedAt: Date;
  confidence: number;
  source: "auto" | "manual" | "distilled";
  tags: string[];
  embedding?: number[];
}

export interface MemoryLayer {
  name: string;
  read(query: string, limit?: number): Promise<MemoryCard[]>;
  write(card: MemoryCard): Promise<void>;
  delete(id: string): Promise<void>;
  audit(): Promise<MemoryCard[]>;
}

export interface WorkingMemory {
  currentTask: string;
  taskStack: string[];
  contextNotes: Map<string, string>;
  recentToolResults: Array<{ tool: string; result: string; timestamp: number }>;
  setTask(task: string): void;
  pushSubtask(subtask: string): void;
  popSubtask(): string | undefined;
  note(key: string, value: string): void;
  getNote(key: string): string | undefined;
  addToolResult(tool: string, result: string): void;
  getRecentToolResults(limit?: number): Array<{ tool: string; result: string; timestamp: number }>;
  clear(): void;
}

export interface EpisodicMemory {
  record(event: EpisodicEvent): Promise<void>;
  retrieve(query: string, limit?: number): Promise<EpisodicEvent[]>;
  summarize(sessionId: string): Promise<string>;
}

export interface EpisodicEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  type: "user_message" | "tool_use" | "tool_result" | "error" | "completion";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SemanticMemory {
  store(fact: SemanticFact): Promise<void>;
  query(question: string, limit?: number): Promise<SemanticFact[]>;
  consolidate(): Promise<void>;
}

export interface SemanticFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  createdAt: Date;
  updatedAt?: Date;
  tags?: string[];
}

export interface ProjectMemory {
  loadClaudeMd(cwd: string): Promise<string>;
  loadLocalClaudeMd(cwd: string): Promise<string | null>;
  getProjectRules(cwd: string): Promise<ProjectRule[]>;
}

export interface ProjectRule {
  scope: "global" | "project" | "directory" | "local";
  path: string;
  content: string;
  priority: number;
}

export interface MemorySystem {
  working: WorkingMemory;
  episodic: EpisodicMemory;
  semantic: SemanticMemory;
  project: ProjectMemory;
  inject(query: string, ctx: { cwd: string; projectScope?: string }): Promise<string>;
  distill(sessionId: string): Promise<void>;
}

export interface ConsolidationPolicy {
  maxAgeDays: number;
  decayFactor: number;
  decayIntervalHours: number;
  mergeSimilarityThreshold: number;
  minImportanceThreshold: number;
  maxEntriesPerRun: number;
  consolidationIntervalHours: number;
  enableDecay: boolean;
  enableMerge: boolean;
  enablePrune: boolean;
}

export interface ConsolidationResult {
  decayedCount: number;
  mergedCount: number;
  prunedCount: number;
  duration: number;
  timestamp: number;
}

export interface ConsolidationMetrics {
  totalEntries: number;
  avgImportance: number;
  entriesByType: Record<string, number>;
  importanceDistribution: { bucket: string; count: number }[];
  decayHistory: { timestamp: number; count: number }[];
  mergeHistory: { timestamp: number; count: number }[];
  pruneHistory: { timestamp: number; count: number }[];
}

export interface MemoryEntry {
  id: string;
  type: 'episodic' | 'semantic' | 'working' | 'project';
  content: string;
  summary?: string;
  importance: number;
  createdAt: number;
  updatedAt: number;
  validFrom: number;
  validUntil?: number;
  tags: string[];
  source?: string;
  provenance?: ProvenanceInfo;
  embedding?: number[];
  decayCount: number;
  lastDecayAt?: number;
  supersededBy?: string;
  isDeleted: boolean;
}

export interface ProvenanceInfo {
  sessionId: string;
  agentId?: string;
  toolName?: string;
  evidence: string;
  timestamp: number;
}

export interface Observation {
  id: string;
  type: 'decision' | 'discovery' | 'learning' | 'preference' | 'pattern';
  content: string;
  confidence: number;
  extractedFrom: string;
  createdAt: number;
  tags: string[];
  linkedEntries: string[];
}

export interface TokenBudgetConfig {
  maxTokens: number;
  reservedTokens: number;
  priorityWeights: Record<MemoryPriority, number>;
  enableCompression: boolean;
  compressionRatio: number;
  fallbackToSummary: boolean;
}

export type MemoryPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ContextBundle {
  query: string;
  segments: ContextSegment[];
  totalTokens: number;
  maxTokens: number;
  hitRate: number;
  renderedContent: string;
}

export interface ContextSegment {
  id: string;
  content: string;
  tokens: number;
  priority: MemoryPriority;
  source: 'episodic' | 'semantic' | 'working' | 'project' | 'observation';
  memoryId?: string;
  summary?: string;
  canExpand: boolean;
  importance: number;
}

export interface TokenEstimate {
  text: string;
  tokens: number;
  charCount: number;
}

export interface HybridRetrievalConfig {
  bm25Weight: number;
  vectorWeight: number;
  rrfK: number;
  minScoreThreshold: number;
  maxResults: number;
  enableReranking: boolean;
  rerankTopK: number;
}

export interface RetrievalItem {
  id: string;
  content: string;
  score: number;
  source: 'bm25' | 'vector' | 'hybrid';
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface HybridRetrievalResult {
  query: string;
  items: RetrievalItem[];
  bm25Scores: Map<string, number>;
  vectorScores: Map<string, number>;
  combinedScores: Map<string, number>;
  totalTokens: number;
  retrievalTime: number;
}

export interface PyramidConfig {
  defaultTopK: number;
  expansionThreshold: number;
  maxExpansionItems: number;
  tokenEstimateRatio: number;
  lazyLoadColdStorage: boolean;
}

export enum RetrievalLevel {
  SUMMARY = 'summary',
  METADATA = 'metadata',
  DETAILS = 'details',
  EVIDENCE = 'evidence',
}

export interface MemoryUnit {
  id: string;
  type: 'text' | 'image' | 'audio' | 'video';
  content: string;
  summary?: string;
  metadata: MemoryMetadata;
  coldStorageUri?: string;
  importance: number;
  createdAt: number;
}

export interface MemoryMetadata {
  sessionId?: string;
  agentId?: string;
  tags: string[];
  modality?: string;
  duration?: number;
  size?: number;
  format?: string;
}

export interface PyramidRetrievalResult {
  query: string;
  level: RetrievalLevel;
  items: PyramidItem[];
  totalCandidates: number;
  tokensUsedEstimate: number;
  canExpand: boolean;
  expansionCandidates: string[];
  retrievalLevels: Map<string, RetrievalLevel>;
}

export interface PyramidItem {
  id: string;
  level: RetrievalLevel;
  content: string;
  summary: string;
  tokens: number;
  canExpand: boolean;
  coldStorageUri?: string;
  importance: number;
  source: 'episodic' | 'semantic' | 'working' | 'project';
  metadata: MemoryMetadata;
  expansionRecommendation?: number;
}

export interface ExpansionRequest {
  itemIds: string[];
  targetLevel: RetrievalLevel;
}

export enum SessionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  RECORDING = 'recording',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ENDED = 'ended',
}

export interface Session {
  id: string;
  project: string;
  status: SessionStatus;
  startedAt: number;
  stoppedAt?: number;
  endedAt?: number;
  userPrompt?: string;
  contextBudget: number;
  events: SessionEvent[];
  observations: SessionObservation[];
  finalizationReport?: FinalizationReport;
  metadata: SessionMetadata;
}

export interface SessionEvent {
  id: string;
  type: 'message' | 'tool_use' | 'file_change' | 'decision' | 'error';
  timestamp: number;
  content: string;
  metadata?: Record<string, unknown>;
  redacted: boolean;
  importance: number;
}

export interface SessionObservation {
  id: string;
  type: 'decision' | 'discovery' | 'learning' | 'preference' | 'pattern';
  content: string;
  confidence: number;
  extractedFrom: string;
  timestamp: number;
  linkedEvents: string[];
}

export interface FinalizationReport {
  sessionId: string;
  totalEvents: number;
  observationsExtracted: number;
  tokensUsed: number;
  duration: number;
  qualityScore: number;
  distillations: DistillationResult[];
}

export interface DistillationResult {
  type: 'semantic' | 'episodic' | 'project';
  entriesCreated: number;
  confidence: number;
}

export interface SessionMetadata {
  agentId?: string;
  userId?: string;
  tags: string[];
  parentSessionId?: string;
  systemPrompt?: string;
}

export interface SessionLifecycleConfig {
  enableAutoStop: boolean;
  autoStopIdleMinutes: number;
  enableAutoDistill: boolean;
  enableObservationExtraction: boolean;
  maxEventsPerSession: number;
  maxObservationsPerSession: number;
}

export const MEMORY_TYPE_VALUES = [
  'User',
  'Project',
  'Local',
  'Managed',
  'AutoMem',
  'TeamMem',
] as const;

export type MemoryType = (typeof MEMORY_TYPE_VALUES)[number];

export interface ManagedMemoryConfig {
  type: MemoryType;
  path: string;
  maxSizeBytes?: number;
  ttlDays?: number;
  syncIntervalMinutes?: number;
  encryptionEnabled?: boolean;
}

export interface TeamMemoryConfig extends ManagedMemoryConfig {
  teamId: string;
  members: string[];
  permissions: Record<string, 'read' | 'write' | 'admin'>;
}

export interface MemoryStore {
  type: MemoryType;
  get(key: string): Promise<MemoryEntry | null>;
  set(key: string, entry: MemoryEntry): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<MemoryEntry[]>;
  query(text: string, limit?: number): Promise<MemoryEntry[]>;
}

export interface SessionHooks {
  onEvent?: (session: Session, event: SessionEvent) => void;
  onObservation?: (session: Session, observation: SessionObservation) => void;
  onStatusChange?: (session: Session, oldStatus: SessionStatus, newStatus: SessionStatus) => void;
  onDistill?: (session: Session, result: DistillationResult) => void;
  onFinalize?: (session: Session, report: FinalizationReport) => void;
}

export type KGEntityType = "concept" | "entity" | "event" | "document";

export type KGRelationType =
  | "owns"
  | "implements"
  | "depends_on"
  | "uses"
  | "part_of"
  | "related_to"
  | "causes"
  | "precedes"
  | "succeeds"
  | "associates_with"
  | "derives_from";

export interface KGProperty {
  key: string;
  value: string | number | boolean | null;
  type: "string" | "number" | "boolean" | "null";
}

export interface KGEntity {
  id: string;
  type: KGEntityType;
  name: string;
  description?: string;
  properties: KGProperty[];
  confidence: number;
  createdAt: number;
  updatedAt: number;
  source?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface KGRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: KGRelationType;
  weight: number;
  properties?: KGProperty[];
  confidence?: number;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

export interface KGQueryOptions {
  relationTypes?: KGRelationType[];
  maxDepth?: number;
  direction?: "outgoing" | "incoming" | "both";
  entityTypes?: KGEntityType[];
  predicate?: (entity: KGEntity) => boolean;
}

export interface KGPathResult {
  path: string[];
  relations: KGRelation[];
  totalWeight: number;
  length: number;
}

export interface KGInferenceResult {
  sourceEntityId: string;
  targetEntityId: string;
  inferredRelation: KGRelation;
  confidence: number;
  reasoning: string;
}

export interface KGGraph {
  addEntity(entity: KGEntity): void;
  updateEntity(id: string, updates: Partial<KGEntity>): KGEntity | null;
  removeEntity(id: string): boolean;
  getEntity(id: string): KGEntity | undefined;
  getEntitiesByType(type: KGEntityType): KGEntity[];
  addRelation(relation: KGRelation): void;
  removeRelation(id: string): boolean;
  getRelation(id: string): KGRelation | undefined;
  getRelationsByType(type: KGRelationType): KGRelation[];
  getOutgoingRelations(entityId: string): KGRelation[];
  getIncomingRelations(entityId: string): KGRelation[];
  query(startEntityId: string, options?: KGQueryOptions): KGEntity[];
  findPath(startId: string, endId: string, options?: { maxLength?: number; relationTypes?: KGRelationType[] }): KGPathResult | null;
  findAllPaths(startId: string, endId: string, options?: { maxLength?: number; maxPaths?: number; relationTypes?: KGRelationType[] }): KGPathResult[];
  infer(options?: { startEntityId?: string; relationTypes?: KGRelationType[]; maxDepth?: number }): KGInferenceResult[];
  getNeighbors(entityId: string, options?: { direction?: "outgoing" | "incoming" | "both"; maxDistance?: number }): Map<string, { entity: KGEntity; viaRelation: KGRelation; distance: number }>;
  getStats(): {
    entityCount: number;
    relationCount: number;
    entitiesByType: Record<KGEntityType, number>;
    relationsByType: Record<KGRelationType, number>;
    avgRelationsPerEntity: number;
  };
  clear(): void;
  export(): { entities: KGEntity[]; relations: KGRelation[] };
  import(data: { entities: KGEntity[]; relations: KGRelation[] }): void;
}
