import {
  ClassifierInput,
  ClassifierOutput,
  TwoStageResult,
  PermissionClassifierConfig,
  DEFAULT_CLASSIFIER_CONFIG,
} from './types'

export abstract class PermissionClassifier {
  protected config: PermissionClassifierConfig
  protected callHistory: Array<{
    timestamp: string
    input: ClassifierInput
    output: ClassifierOutput
    duration: number
  }> = []

  constructor(config: Partial<PermissionClassifierConfig> = {}) {
    this.config = { ...DEFAULT_CLASSIFIER_CONFIG, ...config }
  }

  abstract classify(input: ClassifierInput): Promise<ClassifierOutput>

  abstract classifyTwoStage(input: ClassifierInput): Promise<TwoStageResult>

  protected recordCall(
    input: ClassifierInput,
    output: ClassifierOutput,
    duration: number,
  ): void {
    this.callHistory.push({
      timestamp: new Date().toISOString(),
      input,
      output,
      duration,
    })
  }

  getCallHistory(): Array<{
    timestamp: string
    input: ClassifierInput
    output: ClassifierOutput
    duration: number
  }> {
    return [...this.callHistory]
  }

  clearHistory(): void {
    this.callHistory = []
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
  }

  getConfig(): PermissionClassifierConfig {
    return { ...this.config }
  }

  updateConfig(updates: Partial<PermissionClassifierConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  protected buildPrompt(input: ClassifierInput): string {
    const { toolName, toolInput, context } = input

    return `You are a permission classifier for an AI code assistant. Analyze the following tool call and determine if it should be allowed, require user confirmation, or be denied.

Tool: ${toolName}
Input: ${JSON.stringify(toolInput, null, 2)}
Context:
- Mode: ${context.mode}
- Working Directory: ${context.workingDirectory}
- Previous Calls: ${context.previousCalls?.length || 0}

Classify this tool call considering:
1. Risk level (low/medium/high/critical)
2. Risk family (file_read, file_write, file_delete, bash_command, network_fetch, network_exfil, privilege_escalation, supply_chain, data_exposure, system_modification, unknown)
3. Confidence (0.0-1.0)
4. Rationale for the decision

Respond with a verdict: allow, ask, or deny

Guidelines:
- Read-only operations are typically low risk
- Write operations require careful evaluation
- Network operations should be scrutinized
- Bash commands need AST-level analysis
- Consider supply chain risks (curl | bash patterns)
- Privilege escalation attempts should be denied`
  }

  protected buildXmlPrompt(input: ClassifierInput): string {
    const basePrompt = this.buildPrompt(input)

    return `${basePrompt}

Provide your response in the following XML format:
<permission_decision version="1">
  <verdict>allow|ask|deny</verdict>
  <risk_level>low|medium|high|critical</risk_level>
  <risk_family>file_read|file_write|file_delete|bash_command|network_fetch|network_exfil|privilege_escalation|supply_chain|data_exposure|system_modification|unknown</risk_family>
  <confidence>0.0-1.0</confidence>
  <rationale>Detailed explanation of the decision</rationale>
  <suggested_actions>
    <action>Optional suggestion 1</action>
    <action>Optional suggestion 2</action>
  </suggested_actions>
</permission_decision>`
  }
}
