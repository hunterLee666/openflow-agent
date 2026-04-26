import { z } from "zod";

export const IntentType = {
  CODE_GENERATION: "code_generation",
  CODE_REVIEW: "code_review",
  DEBUGGING: "debugging",
  REFACTORING: "refactoring",
  EXPLORATION: "exploration",
  DOCUMENTATION: "documentation",
  DEPLOYMENT: "deployment",
  TESTING: "testing",
  CONFIGURATION: "configuration",
  MEMORY_QUERY: "memory_query",
  MEMORY_WRITE: "memory_write",
  TASK_PLANNING: "task_planning",
  CONVERSATION: "conversation",
  FILE_OPERATION: "file_operation",
  SYSTEM_OPERATION: "system_operation",
  CUSTOM: "custom",
} as const;

export const IntentTypeSchema = z.enum([
  "code_generation",
  "code_review",
  "debugging",
  "refactoring",
  "exploration",
  "documentation",
  "deployment",
  "testing",
  "configuration",
  "memory_query",
  "memory_write",
  "task_planning",
  "conversation",
  "file_operation",
  "system_operation",
  "custom",
]);

export type IntentType = (typeof IntentType)[keyof typeof IntentType];

export const SafetyLevel = {
  SAFE: "safe",
  CAUTION: "caution",
  DANGEROUS: "dangerous",
  BLOCKED: "blocked",
} as const;

export const SafetyLevelSchema = z.enum(["safe", "caution", "dangerous", "blocked"]);

export type SafetyLevel = (typeof SafetyLevel)[keyof typeof SafetyLevel];

export const SafetyFlag = {
  NONE: "none",
  DESTRUCTIVE_OPERATION: "destructive_operation",
  SENSITIVE_DATA_ACCESS: "sensitive_data_access",
  EXTERNAL_COMMUNICATION: "external_communication",
  PRIVILEGE_ESCALATION: "privilege_escalation",
  MASS_DELETION: "mass_deletion",
  SYSTEM_MODIFICATION: "system_modification",
  CREDENTIAL_MANIPULATION: "credential_manipulation",
} as const;

export const SafetyFlagSchema = z.enum([
  "none",
  "destructive_operation",
  "sensitive_data_access",
  "external_communication",
  "privilege_escalation",
  "mass_deletion",
  "system_modification",
  "credential_manipulation",
]);

export type SafetyFlag = (typeof SafetyFlag)[keyof typeof SafetyFlag];

export const EntityType = {
  FILE: "file",
  DIRECTORY: "directory",
  FUNCTION: "function",
  CLASS: "class",
  VARIABLE: "variable",
  PROJECT: "project",
  TOOL: "tool",
  PERSON: "person",
  CONCEPT: "concept",
  URL: "url",
} as const;

export const EntityTypeSchema = z.enum([
  "file",
  "directory",
  "function",
  "class",
  "variable",
  "project",
  "tool",
  "person",
  "concept",
  "url",
]);

export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export const OutputType = {
  CODE: "code",
  TEXT: "text",
  FILE: "file",
  COMMAND: "command",
  ANALYSIS: "analysis",
  SUMMARY: "summary",
  LIST: "list",
  NONE: "none",
} as const;

export const OutputTypeSchema = z.enum([
  "code",
  "text",
  "file",
  "command",
  "analysis",
  "summary",
  "list",
  "none",
]);

export type OutputType = (typeof OutputType)[keyof typeof OutputType];

export const IntentComplexity = {
  SIMPLE: "simple",
  MODERATE: "moderate",
  COMPLEX: "complex",
  MULTI_STEP: "multi_step",
} as const;

export const IntentComplexitySchema = z.enum([
  "simple",
  "moderate",
  "complex",
  "multi_step",
]);

export type IntentComplexity = (typeof IntentComplexity)[keyof typeof IntentComplexity];

export const SentimentType = {
  NEUTRAL: "neutral",
  URGENT: "urgent",
  FRUSTRATED: "frustrated",
  EXPLORATORY: "exploratory",
  CONFIRMING: "confirming",
} as const;

export const SentimentTypeSchema = z.enum([
  "neutral",
  "urgent",
  "frustrated",
  "exploratory",
  "confirming",
]);

export type SentimentType = (typeof SentimentType)[keyof typeof SentimentType];

export const EntitySchema = z.object({
  name: z.string(),
  type: EntityTypeSchema,
  confidence: z.number(),
});

export type Entity = z.infer<typeof EntitySchema>;

export const TimeReferenceSchema = z.object({
  expression: z.string(),
  resolved: z.string().optional(),
  type: z.enum(["absolute", "relative"]),
});

export type TimeReference = z.infer<typeof TimeReferenceSchema>;

export const IntentMetadataSchema = z.object({
  entities: z.array(EntitySchema),
  timeReferences: z.array(TimeReferenceSchema),
  contextRequirements: z.array(z.string()),
  expectedOutputType: OutputTypeSchema,
  complexity: IntentComplexitySchema,
  language: z.string(),
  sentiment: SentimentTypeSchema,
});

export type IntentMetadata = z.infer<typeof IntentMetadataSchema>;

export const SubIntentSchema = z.object({
  type: z.string(),
  confidence: z.number(),
  description: z.string(),
});

export type SubIntent = z.infer<typeof SubIntentSchema>;

export const ToolGapSchema = z.object({
  missingTool: z.string(),
  purpose: z.string(),
  alternative: z.string(),
  searchQuery: z.string(),
});

export type ToolGap = z.infer<typeof ToolGapSchema>;

export const WorkflowStepSchema = z.object({
  order: z.number(),
  action: z.string(),
  tool: z.string(),
  description: z.string(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowPlanSchema = z.object({
  recommendedWorkflow: z.string(),
  recommendedTools: z.array(z.string()),
  toolGapAnalysis: z.array(ToolGapSchema),
  needsWebSearch: z.boolean(),
  webSearchQueries: z.array(z.string()),
  steps: z.array(WorkflowStepSchema),
  reasoning: z.string(),
});

export type WorkflowPlan = z.infer<typeof WorkflowPlanSchema>;

export const TaskNormsSchema = z.object({
  mustDo: z.array(z.string()),
  mustNotDo: z.array(z.string()),
  bestPractices: z.array(z.string()),
  isExploratory: z.boolean(),
});

export type TaskNorms = z.infer<typeof TaskNormsSchema>;

export const IntentRecognitionResultSchema = z.object({
  primaryIntent: IntentTypeSchema,
  confidence: z.number(),
  subIntents: z.array(SubIntentSchema),
  goalDescription: z.string(),
  safetyLevel: SafetyLevelSchema,
  safetyFlags: z.array(SafetyFlagSchema),
  requiresClarification: z.boolean(),
  clarificationQuestion: z.string().optional(),
  metadata: IntentMetadataSchema,
  workflowPlan: WorkflowPlanSchema.optional(),
  taskNorms: TaskNormsSchema.optional(),
});

export type IntentRecognitionResult = z.infer<typeof IntentRecognitionResultSchema>;

export const GoalEntrySchema = z.object({
  goal: z.string(),
  timestamp: z.number(),
  confidence: z.number(),
  isActive: z.boolean(),
});

export type GoalEntry = z.infer<typeof GoalEntrySchema>;

export const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.number(),
});

export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const ConversationContextSchema = z.object({
  sessionId: z.string(),
  currentGoal: z.string(),
  goalHistory: z.array(GoalEntrySchema),
  recentMessages: z.array(ConversationMessageSchema),
  turnCount: z.number(),
  lastIntent: IntentRecognitionResultSchema.optional(),
});

export type ConversationContext = z.infer<typeof ConversationContextSchema>;

export const IntentRecognitionConfigSchema = z.object({
  enableLLM: z.boolean(),
  enableSafetyCheck: z.boolean(),
  enableGoalTracking: z.boolean(),
  enableWorkflowPlanning: z.boolean(),
  enableEnvironmentContext: z.boolean(),
  goalPersistenceWeight: z.number(),
  maxGoalHistory: z.number(),
  safetyThreshold: SafetyLevelSchema,
  language: z.string(),
});

export type IntentRecognitionConfig = z.infer<typeof IntentRecognitionConfigSchema>;

const DEFAULT_CONFIG: IntentRecognitionConfig = {
  enableLLM: true,
  enableSafetyCheck: true,
  enableGoalTracking: true,
  enableWorkflowPlanning: true,
  enableEnvironmentContext: true,
  goalPersistenceWeight: 0.7,
  maxGoalHistory: 20,
  safetyThreshold: SafetyLevel.CAUTION,
  language: "auto",
};

export class IntentRecognizer {
  private config: IntentRecognitionConfig;
  private llmClient: any;
  private goalTracker: any;
  private safetyChecker: any;
  private environmentContext: string;
  private availableTools: string[];
  private availableSkills: string[];

  constructor(config?: Partial<IntentRecognitionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.environmentContext = "";
    this.availableTools = [];
    this.availableSkills = [];
  }

  setLLMClient(client: any): void {
    this.llmClient = client;
  }

  setGoalTracker(tracker: any): void {
    this.goalTracker = tracker;
  }

  setSafetyChecker(checker: any): void {
    this.safetyChecker = checker;
  }

  setEnvironmentContext(context: string): void {
    this.environmentContext = context;
  }

  setAvailableTools(tools: string[]): void {
    this.availableTools = tools;
  }

  setAvailableSkills(skills: string[]): void {
    this.availableSkills = skills;
  }

  async recognizeIntent(
    userInput: string,
    context?: ConversationContext
  ): Promise<IntentRecognitionResult> {
    let result: IntentRecognitionResult;

    if (this.config.enableLLM && this.llmClient) {
      result = await this.recognizeWithLLM(userInput, context);
    } else {
      result = this.recognizeWithRules(userInput, context);
    }

    if (this.config.enableSafetyCheck && this.safetyChecker) {
      const safetyResult = await this.safetyChecker.check(userInput, result);
      result.safetyLevel = safetyResult.level;
      result.safetyFlags = safetyResult.flags;

      if (safetyResult.level === SafetyLevel.BLOCKED) {
        result.requiresClarification = true;
        result.clarificationQuestion = safetyResult.blockMessage || "此操作被安全策略阻止。";
      }
    }

    if (this.config.enableGoalTracking && this.goalTracker && context) {
      const goalUpdate = await this.goalTracker.updateGoal(
        userInput,
        context,
        result,
        this.config.goalPersistenceWeight
      );
      result.goalDescription = goalUpdate.currentGoal;
      result.metadata.contextRequirements.push(`当前目标: ${goalUpdate.currentGoal}`);
    }

    return result;
  }

  private async recognizeWithLLM(
    userInput: string,
    context?: ConversationContext
  ): Promise<IntentRecognitionResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(userInput, context);

    const response = await this.llmClient.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1024,
      temperature: 0.1,
    });

    return this.parseLLMResponse(response.text || response.content);
  }

  private buildSystemPrompt(): string {
    const envSection = this.config.enableEnvironmentContext && this.environmentContext
      ? `\n## 当前环境信息
${this.environmentContext}

请根据上述环境信息，选择最适合当前任务的工具和工作流。如果环境中已有工具无法满足需求，可以考虑推荐全网搜索解决方案。`
      : "";

    const toolsSection = this.availableTools.length > 0
      ? `\n## 可用工具列表
${this.availableTools.map((t, i) => `${i + 1}. ${t}`).join("\n")}

请从上述工具中选择最适合完成当前任务的工具组合。`
      : "";

    const skillsSection = this.availableSkills.length > 0
      ? `\n## 可用 Skills
${this.availableSkills.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

    return `你是一个意图识别和任务规划专家，负责分析用户的真实意图，并制定最佳的工作流和工具使用方案。

## 任务
分析用户输入，识别以下维度：

### 1. 主要意图 (primaryIntent)
从以下类别中选择最匹配的一个：
- code_generation: 生成代码
- code_review: 代码审查
- debugging: 调试问题
- refactoring: 重构代码
- exploration: 探索代码库
- documentation: 编写文档
- deployment: 部署相关
- testing: 测试相关
- configuration: 配置修改
- memory_query: 查询记忆
- memory_write: 写入记忆
- task_planning: 任务规划
- conversation: 日常对话
- file_operation: 文件操作
- system_operation: 系统操作
- custom: 其他

### 2. 安全等级 (safetyLevel)
- safe: 安全，无风险
- caution: 需要谨慎，可能影响文件/配置
- dangerous: 危险，可能破坏数据或系统
- blocked: 被阻止，违反安全策略

### 3. 安全标记 (safetyFlags)
- none: 无
- destructive_operation: 破坏性操作
- sensitive_data_access: 敏感数据访问
- external_communication: 外部通信
- privilege_escalation: 权限提升
- mass_deletion: 批量删除
- system_modification: 系统修改
- credential_manipulation: 凭证操作

### 4. 目标描述 (goalDescription)
用一句话描述用户的核心目标。

### 5. 实体提取 (entities)
提取用户提到的文件、函数、类、项目、工具等实体。

### 6. 复杂度 (complexity)
- simple: 简单，单步操作
- moderate: 中等，少量步骤
- complex: 复杂，多步骤
- multi_step: 多阶段任务

### 7. 工作流规划 (workflowPlan)
${this.config.enableWorkflowPlanning ? `根据用户意图和环境信息，推理出完成该任务的最佳工作流和工具：
- recommendedWorkflow: 推荐的工作流名称（如 "开发-测试-部署流水线"、"代码审查流程" 等）
- recommendedTools: 推荐的工具列表（从可用工具中选择）
- toolGapAnalysis: 工具缺口分析 - 如果当前环境中的工具不能满足完成任务的目标，列出缺失的工具和搜索方案
  - missingTool: 缺失的工具名称
  - purpose: 该工具的用途
  - alternative: 当前可用的替代方案
  - searchQuery: 用于全网搜索该工具的搜索词
- needsWebSearch: 是否需要全网搜索（当工具不足或需要查找最新解决方案时为 true）
- webSearchQueries: 全网搜索的关键词列表
- steps: 工作流步骤
  - order: 步骤顺序
  - action: 动作名称
  - tool: 使用的工具
  - description: 步骤描述
- reasoning: 选择该工作流的推理过程` : "禁用"}

### 8. 任务规范 (taskNorms)
根据任务类型，推断出完成该任务的最佳规范和禁忌：
- mustDo: 必须遵守的规范（如 "先读取文件再修改"、"写测试用例"、"遵循项目代码风格" 等）
- mustNotDo: 绝对不能做的事情（如 "不要删除未备份的文件"、"不要硬编码密钥"、"不要跳过测试" 等）
- bestPractices: 最佳实践建议
- isExploratory: 是否是探索/研究/头脑风暴类任务（这类任务可以放宽规范限制）

注意：
- 对于开发、调试、重构、部署等执行类任务，mustDo 和 mustNotDo 必须严格遵守
- 对于 exploration、conversation、task_planning 等探索/研究类任务，isExploratory 设为 true，规范可以适当放宽
- mustNotDo 是安全底线，除非 isExploratory 为 true，否则绝对不能违反
${envSection}${toolsSection}${skillsSection}

## 输出格式
必须输出 JSON，格式如下：
{
  "primaryIntent": "意图类型",
  "confidence": 0.0-1.0,
  "subIntents": [{"type": "子意图", "confidence": 0.0-1.0, "description": "描述"}],
  "goalDescription": "用户目标描述",
  "safetyLevel": "安全等级",
  "safetyFlags": ["安全标记"],
  "requiresClarification": false,
  "clarificationQuestion": null,
  "metadata": {
    "entities": [{"name": "实体名", "type": "实体类型", "confidence": 0.0-1.0}],
    "timeReferences": [],
    "contextRequirements": [],
    "expectedOutputType": "输出类型",
    "complexity": "复杂度",
    "language": "语言",
    "sentiment": "情感"
  },
  "workflowPlan": {
    "recommendedWorkflow": "工作流名称",
    "recommendedTools": ["工具1", "工具2"],
    "toolGapAnalysis": [{"missingTool": "缺失工具", "purpose": "用途", "alternative": "替代方案", "searchQuery": "搜索词"}],
    "needsWebSearch": false,
    "webSearchQueries": ["搜索词1"],
    "steps": [{"order": 1, "action": "动作", "tool": "工具", "description": "描述"}],
    "reasoning": "推理过程"
  },
  "taskNorms": {
    "mustDo": ["必须做的事"],
    "mustNotDo": "绝对不能做的事",
    "bestPractices": ["最佳实践"],
    "isExploratory": false
  }
}

## 重要规则
1. 如果用户输入模糊，设置 requiresClarification 为 true
2. 安全等级必须保守评估
3. 实体类型从 file/directory/function/class/variable/project/tool/person/concept/url 中选择
4. 情感从 neutral/urgent/frustrated/exploratory/confirming 中选择
5. 输出类型从 code/text/file/command/analysis/summary/list/none 中选择
6. 工作流规划必须结合当前环境信息，选择最合适的工具组合
7. 如果工具不足，必须提供全网搜索方案
8. 任务规范必须具体、可执行，不能是空泛的建议`;
  }

  private buildUserPrompt(userInput: string, context?: ConversationContext): string {
    let prompt = `用户输入: "${userInput}"\n\n`;

    if (context) {
      prompt += `## 会话上下文\n`;
      prompt += `当前目标: ${context.currentGoal}\n`;
      prompt += `对话轮次: ${context.turnCount}\n`;

      if (context.recentMessages.length > 0) {
        const recent = context.recentMessages.slice(-5);
        prompt += `最近对话:\n`;
        for (const msg of recent) {
          prompt += `[${msg.role}]: ${msg.content}\n`;
        }
      }

      if (context.goalHistory.length > 0) {
        const activeGoals = context.goalHistory.filter((g: GoalEntry) => g.isActive).slice(-3);
        if (activeGoals.length > 0) {
          prompt += `活跃目标:\n`;
          for (const goal of activeGoals) {
            prompt += `- ${goal.goal} (置信度: ${goal.confidence})\n`;
          }
        }
      }
    }

    prompt += `\n请分析用户意图，输出 JSON。`;
    return prompt;
  }

  private parseLLMResponse(text: string): IntentRecognitionResult {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          primaryIntent: parsed.primaryIntent || IntentType.CONVERSATION,
          confidence: parsed.confidence ?? 0.5,
          subIntents: parsed.subIntents || [],
          goalDescription: parsed.goalDescription || "",
          safetyLevel: parsed.safetyLevel || SafetyLevel.SAFE,
          safetyFlags: parsed.safetyFlags || [SafetyFlag.NONE],
          requiresClarification: parsed.requiresClarification || false,
          clarificationQuestion: parsed.clarificationQuestion,
          workflowPlan: parsed.workflowPlan,
          taskNorms: parsed.taskNorms,
          metadata: {
            entities: parsed.metadata?.entities || [],
            timeReferences: parsed.metadata?.timeReferences || [],
            contextRequirements: parsed.metadata?.contextRequirements || [],
            expectedOutputType: parsed.metadata?.expectedOutputType || OutputType.TEXT,
            complexity: parsed.metadata?.complexity || IntentComplexity.SIMPLE,
            language: parsed.metadata?.language || "zh",
            sentiment: parsed.metadata?.sentiment || SentimentType.NEUTRAL,
          },
        };
      }
    } catch {
      // Fall back to default result
    }

    return this.createDefaultResult(text);
  }

  private recognizeWithRules(
    userInput: string,
    context?: ConversationContext
  ): IntentRecognitionResult {
    const lowerInput = userInput.toLowerCase();

    let primaryIntent: IntentType = IntentType.CONVERSATION;
    let confidence = 0.5;

    if (lowerInput.includes("文档") || lowerInput.includes("doc") || lowerInput.includes("说明")) {
      primaryIntent = IntentType.DOCUMENTATION;
      confidence = 0.7;
    } else if (lowerInput.includes("测试") || lowerInput.includes("test")) {
      primaryIntent = IntentType.TESTING;
      confidence = 0.7;
    } else if (lowerInput.includes("写") || lowerInput.includes("生成") || lowerInput.includes("create") || lowerInput.includes("generate")) {
      primaryIntent = IntentType.CODE_GENERATION;
      confidence = 0.7;
    } else if (lowerInput.includes("调试") || lowerInput.includes("debug") || lowerInput.includes("报错") || lowerInput.includes("错误")) {
      primaryIntent = IntentType.DEBUGGING;
      confidence = 0.7;
    } else if (lowerInput.includes("重构") || lowerInput.includes("refactor") || lowerInput.includes("优化")) {
      primaryIntent = IntentType.REFACTORING;
      confidence = 0.7;
    } else if (lowerInput.includes("部署") || lowerInput.includes("deploy") || lowerInput.includes("发布")) {
      primaryIntent = IntentType.DEPLOYMENT;
      confidence = 0.7;
    } else if (lowerInput.includes("查看") || lowerInput.includes("搜索") || lowerInput.includes("find") || lowerInput.includes("search")) {
      primaryIntent = IntentType.EXPLORATION;
      confidence = 0.6;
    }

    if (context?.currentGoal) {
      confidence = Math.min(1.0, confidence + this.config.goalPersistenceWeight * 0.3);
    }

    return {
      primaryIntent,
      confidence,
      subIntents: [],
      goalDescription: context?.currentGoal || userInput.slice(0, 100),
      safetyLevel: SafetyLevel.SAFE,
      safetyFlags: [SafetyFlag.NONE],
      requiresClarification: false,
      metadata: {
        entities: [],
        timeReferences: [],
        contextRequirements: [],
        expectedOutputType: OutputType.TEXT,
        complexity: IntentComplexity.SIMPLE,
        language: /[\u4e00-\u9fff]/.test(userInput) ? "zh" : "en",
        sentiment: SentimentType.NEUTRAL,
      },
    };
  }

  private createDefaultResult(text: string): IntentRecognitionResult {
    return {
      primaryIntent: IntentType.CONVERSATION,
      confidence: 0.3,
      subIntents: [],
      goalDescription: text.slice(0, 100),
      safetyLevel: SafetyLevel.SAFE,
      safetyFlags: [SafetyFlag.NONE],
      requiresClarification: true,
      clarificationQuestion: "我不太理解您的需求，能否详细说明？",
      metadata: {
        entities: [],
        timeReferences: [],
        contextRequirements: [],
        expectedOutputType: OutputType.TEXT,
        complexity: IntentComplexity.SIMPLE,
        language: "auto",
        sentiment: SentimentType.NEUTRAL,
      },
    };
  }
}

export function createIntentRecognizer(config?: Partial<IntentRecognitionConfig>): IntentRecognizer {
  return new IntentRecognizer(config);
}
