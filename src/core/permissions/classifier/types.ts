export type PermissionVerdict = 'allow' | 'ask' | 'deny'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type RiskFamily = 
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'bash_command'
  | 'network_fetch'
  | 'network_exfil'
  | 'privilege_escalation'
  | 'supply_chain'
  | 'data_exposure'
  | 'system_modification'
  | 'unknown'

export interface ClassifierInput {
  toolName: string
  toolInput: Record<string, unknown>
  context: {
    mode: string
    workingDirectory: string
    previousCalls?: ClassifierCallRecord[]
  }
}

export interface ClassifierOutput {
  verdict: PermissionVerdict
  riskLevel: RiskLevel
  riskFamily: RiskFamily
  confidence: number
  rationale: string
  suggestedActions?: string[]
  metadata?: Record<string, unknown>
}

export interface XmlClassifierOutput extends ClassifierOutput {
  xml: string
  parsed: boolean
  parseErrors?: string[]
}

export interface ClassifierCallRecord {
  timestamp: string
  input: ClassifierInput
  output: ClassifierOutput
  duration: number
}

export interface TwoStageResult {
  stage1: ClassifierOutput
  stage2?: XmlClassifierOutput
  final: ClassifierOutput
}

export interface PermissionClassifierConfig {
  enabled: boolean
  modelId: string
  maxTokens: number
  temperature: number
  timeout: number
  retryAttempts: number
  cacheResults: boolean
  cacheTTL: number
}

export const DEFAULT_CLASSIFIER_CONFIG: PermissionClassifierConfig = {
  enabled: true,
  modelId: 'claude-sonnet-4-20250514',
  maxTokens: 1024,
  temperature: 0.3,
  timeout: 10000,
  retryAttempts: 2,
  cacheResults: true,
  cacheTTL: 300000,
}

export const HIGH_RISK_FAMILIES: Set<RiskFamily> = new Set([
  'file_delete',
  'network_exfil',
  'privilege_escalation',
  'supply_chain',
  'data_exposure',
  'system_modification',
])

export const MEDIUM_RISK_FAMILIES: Set<RiskFamily> = new Set([
  'file_write',
  'bash_command',
  'network_fetch',
])

export const LOW_RISK_FAMILIES: Set<RiskFamily> = new Set([
  'file_read',
  'unknown',
])
