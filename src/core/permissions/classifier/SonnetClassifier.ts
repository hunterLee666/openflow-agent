import { PermissionClassifier } from './PermissionClassifier'
import {
  ClassifierInput,
  ClassifierOutput,
  TwoStageResult,
  PermissionClassifierConfig,
  PermissionVerdict,
  RiskLevel,
  RiskFamily,
} from './types'
import { parseXmlClassifierOutput } from './XmlParser'

export class SonnetClassifier extends PermissionClassifier {
  private apiKey: string | undefined
  private apiEndpoint: string

  constructor(
    config: Partial<PermissionClassifierConfig> = {},
    apiKey?: string,
    apiEndpoint: string = 'https://api.anthropic.com/v1/messages',
  ) {
    super(config)
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY
    this.apiEndpoint = apiEndpoint
  }

  async classify(input: ClassifierInput): Promise<ClassifierOutput> {
    if (!this.config.enabled) {
      return this.getDefaultDenyOutput('Classifier is disabled')
    }

    if (!this.apiKey) {
      return this.getDefaultDenyOutput('API key not configured')
    }

    const startTime = Date.now()

    try {
      const prompt = this.buildPrompt(input)
      const response = await this.callApi(prompt)
      const output = this.parseResponse(response)

      const duration = Date.now() - startTime
      this.recordCall(input, output, duration)

      return output
    } catch (error) {
      const duration = Date.now() - startTime
      const output = this.getDefaultDenyOutput(
        `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
      this.recordCall(input, output, duration)
      return output
    }
  }

  async classifyTwoStage(input: ClassifierInput): Promise<TwoStageResult> {
    if (!this.config.enabled) {
      const denyOutput = this.getDefaultDenyOutput('Classifier is disabled')
      return {
        stage1: denyOutput,
        final: denyOutput,
      }
    }

    if (!this.apiKey) {
      const denyOutput = this.getDefaultDenyOutput('API key not configured')
      return {
        stage1: denyOutput,
        final: denyOutput,
      }
    }

    const startTime = Date.now()

    try {
      const stage1Prompt = this.buildPrompt(input)
      const stage1Response = await this.callApi(stage1Prompt)
      const stage1Output = this.parseResponse(stage1Response)

      if (
        stage1Output.confidence >= 0.9 &&
        stage1Output.riskLevel === 'low'
      ) {
        const duration = Date.now() - startTime
        this.recordCall(input, stage1Output, duration)
        return {
          stage1: stage1Output,
          final: stage1Output,
        }
      }

      const stage2Prompt = this.buildXmlPrompt(input)
      const stage2Response = await this.callApi(stage2Prompt)
      const stage2Output = parseXmlClassifierOutput(stage2Response)

      const duration = Date.now() - startTime
      this.recordCall(input, stage2Output, duration)

      return {
        stage1: stage1Output,
        stage2: stage2Output,
        final: stage2Output,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const denyOutput = this.getDefaultDenyOutput(
        `Two-stage classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
      this.recordCall(input, denyOutput, duration)
      return {
        stage1: denyOutput,
        final: denyOutput,
      }
    }
  }

  private async callApi(prompt: string): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout,
    )

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.modelId,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return data.content?.[0]?.text || ''
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  private parseResponse(response: string): ClassifierOutput {
    const verdict = this.extractVerdict(response)
    const riskLevel = this.extractRiskLevel(response)
    const riskFamily = this.extractRiskFamily(response)
    const confidence = this.extractConfidence(response)
    const rationale = this.extractRationale(response)

    return {
      verdict,
      riskLevel,
      riskFamily,
      confidence,
      rationale,
    }
  }

  private extractVerdict(text: string): PermissionVerdict {
    const lower = text.toLowerCase()
    if (lower.includes('verdict: allow') || lower.includes('verdict:approve')) {
      return 'allow'
    }
    if (lower.includes('verdict: deny') || lower.includes('verdict:block')) {
      return 'deny'
    }
    if (lower.includes('verdict: ask') || lower.includes('verdict:confirm')) {
      return 'ask'
    }

    if (lower.includes('allow')) return 'allow'
    if (lower.includes('deny')) return 'deny'
    if (lower.includes('ask')) return 'ask'

    return 'ask'
  }

  private extractRiskLevel(text: string): RiskLevel {
    const lower = text.toLowerCase()
    if (lower.includes('critical')) return 'critical'
    if (lower.includes('high')) return 'high'
    if (lower.includes('medium')) return 'medium'
    if (lower.includes('low')) return 'low'
    return 'medium'
  }

  private extractRiskFamily(text: string): RiskFamily {
    const families: RiskFamily[] = [
      'file_read',
      'file_write',
      'file_delete',
      'bash_command',
      'network_fetch',
      'network_exfil',
      'privilege_escalation',
      'supply_chain',
      'data_exposure',
      'system_modification',
    ]

    const lower = text.toLowerCase()
    for (const family of families) {
      if (lower.includes(family.replace('_', ' '))) {
        return family
      }
    }

    return 'unknown'
  }

  private extractConfidence(text: string): number {
    const match = text.match(/confidence[:\s]+([0-9.]+)/i)
    if (match) {
      const value = parseFloat(match[1])
      if (!isNaN(value) && value >= 0 && value <= 1) {
        return value
      }
    }

    const percentageMatch = text.match(/confidence[:\s]+(\d+)%/i)
    if (percentageMatch) {
      const value = parseInt(percentageMatch[1])
      if (!isNaN(value) && value >= 0 && value <= 100) {
        return value / 100
      }
    }

    return 0.5
  }

  private extractRationale(text: string): string {
    const match = text.match(/rationale[:\s]+([^\n]+)/i)
    if (match) {
      return match[1].trim()
    }

    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('rationale')) {
        return lines.slice(i + 1).join('\n').trim().substring(0, 500)
      }
    }

    return 'No rationale provided'
  }

  private getDefaultDenyOutput(reason: string): ClassifierOutput {
    return {
      verdict: 'deny',
      riskLevel: 'critical',
      riskFamily: 'unknown',
      confidence: 1.0,
      rationale: reason,
    }
  }
}
