export type ModelTier = 'opus' | 'sonnet' | 'haiku' | 'custom'

export interface ModelPricing {
  inputCostPerMillion: number
  outputCostPerMillion: number
  cacheWriteCostPerMillion: number
  cacheReadCostPerMillion: number
}

export const MODEL_PRICING: Record<ModelTier, ModelPricing> = {
  opus: {
    inputCostPerMillion: 15,
    outputCostPerMillion: 75,
    cacheWriteCostPerMillion: 18.75,
    cacheReadCostPerMillion: 1.5,
  },
  sonnet: {
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
    cacheWriteCostPerMillion: 3.75,
    cacheReadCostPerMillion: 0.375,
  },
  haiku: {
    inputCostPerMillion: 0.25,
    outputCostPerMillion: 1.25,
    cacheWriteCostPerMillion: 0.3,
    cacheReadCostPerMillion: 0.03,
  },
  custom: {
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    cacheWriteCostPerMillion: 0,
    cacheReadCostPerMillion: 0,
  },
}

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly'

export interface UserBudget {
  userId: string
  userName: string
  role: 'developer' | 'sre' | 'lead' | 'admin'
  defaultModel: ModelTier
  limits: {
    daily: number
    weekly: number
    monthly: number
  }
  currentUsage: {
    daily: number
    weekly: number
    monthly: number
  }
  exceptions: BudgetException[]
}

export interface BudgetException {
  id: string
  reason: string
  additionalBudget: number
  period: BudgetPeriod
  expiresAt?: number
  approvedBy: string
  createdAt: number
}

export interface TeamBudgetPolicy {
  teamId: string
  teamName: string
  defaultModel: ModelTier
  defaultLimits: {
    developer: Record<BudgetPeriod, number>
    sre: Record<BudgetPeriod, number>
    lead: Record<BudgetPeriod, number>
    admin: Record<BudgetPeriod, number>
  }
  opusApprovalRequired: boolean
  opusApprovalRoles: string[]
  alertThresholds: {
    warning: number
    critical: number
  }
}

export const DEFAULT_TEAM_POLICY: Omit<TeamBudgetPolicy, 'teamId' | 'teamName'> = {
  defaultModel: 'sonnet',
  defaultLimits: {
    developer: { daily: 5, weekly: 25, monthly: 100 },
    sre: { daily: 10, weekly: 50, monthly: 200 },
    lead: { daily: 15, weekly: 75, monthly: 300 },
    admin: { daily: 50, weekly: 250, monthly: 1000 },
  },
  opusApprovalRequired: true,
  opusApprovalRoles: ['lead', 'admin'],
  alertThresholds: {
    warning: 0.7,
    critical: 0.9,
  },
}

export interface CostRecord {
  id: string
  userId: string
  timestamp: number
  model: ModelTier
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
  requestId: string
  metadata?: Record<string, unknown>
}

export interface BudgetAlert {
  id: string
  userId: string
  type: 'warning' | 'critical' | 'exceeded' | 'approval_required'
  message: string
  period: BudgetPeriod
  usage: number
  limit: number
  timestamp: number
  acknowledged: boolean
}

class BudgetManager {
  private users: Map<string, UserBudget> = new Map()
  private costs: CostRecord[] = []
  private alerts: BudgetAlert[] = []
  private policy: TeamBudgetPolicy
  private maxCostRecords: number

  constructor(policy: TeamBudgetPolicy, maxCostRecords: number = 10000) {
    this.policy = policy
    this.maxCostRecords = maxCostRecords
  }

  registerUser(userId: string, userName: string, role: UserBudget['role']): UserBudget {
    const limits = {
      daily: this.policy.defaultLimits[role].daily,
      weekly: this.policy.defaultLimits[role].weekly,
      monthly: this.policy.defaultLimits[role].monthly,
    }

    const budget: UserBudget = {
      userId,
      userName,
      role,
      defaultModel: this.policy.defaultModel,
      limits,
      currentUsage: { daily: 0, weekly: 0, monthly: 0 },
      exceptions: [],
    }

    this.users.set(userId, budget)
    return budget
  }

  getUser(userId: string): UserBudget | undefined {
    return this.users.get(userId)
  }

  recordCost(record: Omit<CostRecord, 'id' | 'cost'>): CostRecord {
    const pricing = MODEL_PRICING[record.model]
    const cost =
      (record.inputTokens / 1_000_000) * pricing.inputCostPerMillion +
      (record.outputTokens / 1_000_000) * pricing.outputCostPerMillion +
      (record.cacheReadTokens / 1_000_000) * pricing.cacheReadCostPerMillion +
      (record.cacheWriteTokens / 1_000_000) * pricing.cacheWriteCostPerMillion

    const fullRecord: CostRecord = {
      ...record,
      id: `cost_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      cost,
    }

    this.costs.push(fullRecord)
    if (this.costs.length > this.maxCostRecords) {
      this.costs.shift()
    }

    this.updateUserUsage(record.userId, cost)

    return fullRecord
  }

  private updateUserUsage(userId: string, cost: number): void {
    const user = this.users.get(userId)
    if (!user) return

    user.currentUsage.daily += cost
    user.currentUsage.weekly += cost
    user.currentUsage.monthly += cost

    this.checkAndAlert(userId)
  }

  private checkAndAlert(userId: string): void {
    const user = this.users.get(userId)
    if (!user) return

    const periods: BudgetPeriod[] = ['daily', 'weekly', 'monthly']

    for (const period of periods) {
      const usage = user.currentUsage[period]
      const limit = this.getEffectiveLimit(userId, period)
      const ratio = usage / limit

      if (ratio >= 1) {
        this.createAlert(userId, 'exceeded', period, usage, limit)
      } else if (ratio >= this.policy.alertThresholds.critical) {
        this.createAlert(userId, 'critical', period, usage, limit)
      } else if (ratio >= this.policy.alertThresholds.warning) {
        this.createAlert(userId, 'warning', period, usage, limit)
      }
    }
  }

  private createAlert(
    userId: string,
    type: BudgetAlert['type'],
    period: BudgetPeriod,
    usage: number,
    limit: number,
  ): void {
    const existingUnacknowledged = this.alerts.find(
      a => a.userId === userId && a.type === type && a.period === period && !a.acknowledged,
    )

    if (existingUnacknowledged) return

    const messages: Record<BudgetAlert['type'], string> = {
      warning: `Budget warning: ${period} usage at ${(usage / limit * 100).toFixed(1)}%`,
      critical: `Budget critical: ${period} usage at ${(usage / limit * 100).toFixed(1)}%`,
      exceeded: `Budget exceeded: ${period} usage $${usage.toFixed(2)} exceeds limit $${limit.toFixed(2)}`,
      approval_required: 'Approval required for Opus model usage',
    }

    this.alerts.push({
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      type,
      message: messages[type],
      period,
      usage,
      limit,
      timestamp: Date.now(),
      acknowledged: false,
    })
  }

  getEffectiveLimit(userId: string, period: BudgetPeriod): number {
    const user = this.users.get(userId)
    if (!user) return 0

    let limit = user.limits[period]

    const now = Date.now()
    for (const exception of user.exceptions) {
      if (exception.period === period) {
        if (!exception.expiresAt || exception.expiresAt > now) {
          limit += exception.additionalBudget
        }
      }
    }

    return limit
  }

  canUseModel(userId: string, model: ModelTier): { allowed: boolean; reason?: string } {
    const user = this.users.get(userId)
    if (!user) {
      return { allowed: false, reason: 'User not registered' }
    }

    if (model === 'opus' && this.policy.opusApprovalRequired) {
      if (!this.policy.opusApprovalRoles.includes(user.role)) {
        return { allowed: false, reason: 'Opus requires approval from lead or admin' }
      }
    }

    const dailyUsage = user.currentUsage.daily
    const dailyLimit = this.getEffectiveLimit(userId, 'daily')

    if (dailyUsage >= dailyLimit) {
      return { allowed: false, reason: 'Daily budget exceeded' }
    }

    return { allowed: true }
  }

  addException(
    userId: string,
    reason: string,
    additionalBudget: number,
    period: BudgetPeriod,
    approvedBy: string,
    expiresAt?: number,
  ): BudgetException | null {
    const user = this.users.get(userId)
    if (!user) return null

    const exception: BudgetException = {
      id: `exc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      reason,
      additionalBudget,
      period,
      expiresAt,
      approvedBy,
      createdAt: Date.now(),
    }

    user.exceptions.push(exception)
    return exception
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId)
    if (!alert) return false
    alert.acknowledged = true
    return true
  }

  getAlerts(userId?: string): BudgetAlert[] {
    if (userId) {
      return this.alerts.filter(a => a.userId === userId)
    }
    return [...this.alerts]
  }

  getUnacknowledgedAlerts(userId?: string): BudgetAlert[] {
    return this.getAlerts(userId).filter(a => !a.acknowledged)
  }

  resetDailyUsage(): void {
    for (const user of Array.from(this.users.values())) {
      user.currentUsage.daily = 0
    }
  }

  resetWeeklyUsage(): void {
    for (const user of Array.from(this.users.values())) {
      user.currentUsage.weekly = 0
    }
  }

  resetMonthlyUsage(): void {
    for (const user of Array.from(this.users.values())) {
      user.currentUsage.monthly = 0
    }
  }

  getTeamSummary(): {
    totalUsers: number
    totalDailySpend: number
    totalWeeklySpend: number
    totalMonthlySpend: number
    averageDailyPerUser: number
    topSpenders: Array<{ userId: string; userName: string; spend: number }>
  } {
    const users = Array.from(this.users.values())
    const totalDailySpend = users.reduce((sum, u) => sum + u.currentUsage.daily, 0)
    const totalWeeklySpend = users.reduce((sum, u) => sum + u.currentUsage.weekly, 0)
    const totalMonthlySpend = users.reduce((sum, u) => sum + u.currentUsage.monthly, 0)

    const sortedBySpend = [...users].sort((a, b) => b.currentUsage.monthly - a.currentUsage.monthly)
    const topSpenders = sortedBySpend.slice(0, 5).map(u => ({
      userId: u.userId,
      userName: u.userName,
      spend: u.currentUsage.monthly,
    }))

    return {
      totalUsers: users.length,
      totalDailySpend,
      totalWeeklySpend,
      totalMonthlySpend,
      averageDailyPerUser: users.length > 0 ? totalDailySpend / users.length : 0,
      topSpenders,
    }
  }

  getCostHistory(userId?: string, since?: number): CostRecord[] {
    let records = this.costs
    if (userId) {
      records = records.filter(r => r.userId === userId)
    }
    if (since) {
      records = records.filter(r => r.timestamp >= since)
    }
    return records
  }

  estimateCost(
    model: ModelTier,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number = 0,
    cacheWriteTokens: number = 0,
  ): number {
    const pricing = MODEL_PRICING[model]
    return (
      (inputTokens / 1_000_000) * pricing.inputCostPerMillion +
      (outputTokens / 1_000_000) * pricing.outputCostPerMillion +
      (cacheReadTokens / 1_000_000) * pricing.cacheReadCostPerMillion +
      (cacheWriteTokens / 1_000_000) * pricing.cacheWriteCostPerMillion
    )
  }
}

let defaultManager: BudgetManager | null = null

export function getBudgetManager(policy?: TeamBudgetPolicy): BudgetManager {
  if (!defaultManager && policy) {
    defaultManager = new BudgetManager(policy)
  }
  if (!defaultManager) {
    throw new Error('BudgetManager not initialized. Call createBudgetManager first.')
  }
  return defaultManager
}

export function createBudgetManager(
  teamId: string,
  teamName: string,
  policyOverrides?: Partial<TeamBudgetPolicy>,
): BudgetManager {
  const policy: TeamBudgetPolicy = {
    teamId,
    teamName,
    ...DEFAULT_TEAM_POLICY,
    ...policyOverrides,
  }
  defaultManager = new BudgetManager(policy)
  return defaultManager
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${(cost * 100).toFixed(2)}¢`
  if (cost < 1) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(2)}`
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`
  return `${(tokens / 1_000_000).toFixed(2)}M`
}
