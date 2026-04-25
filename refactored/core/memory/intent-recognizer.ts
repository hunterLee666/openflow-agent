export interface IntentRecognitionResult {
  primaryIntent: IntentType;
  confidence: number;
  subIntents: SubIntent[];
  goalDescription: string;
  safetyLevel: SafetyLevel;
  safetyFlags: SafetyFlag[];
  requiresClarification: boolean;
  clarificationQuestion?: string;
  metadata: IntentMetadata;
}

export enum IntentType {
  CODE_GENERATION = "code_generation",
  CODE_REVIEW = "code_review",
  DEBUGGING = "debugging",
  REFACTORING = "refactoring",
  EXPLORATION = "exploration",
  DOCUMENTATION = "documentation",
  DEPLOYMENT = "deployment",
  TESTING = "testing",
  CONFIGURATION = "configuration",
  MEMORY_QUERY = "memory_query",
  MEMORY_WRITE = "memory_write",
  TASK_PLANNING = "task_planning",
  CONVERSATION = "conversation",
  FILE_OPERATION = "file_operation",
  SYSTEM_OPERATION = "system_operation",
  CUSTOM = "custom",
}

export interface SubIntent {
  type: string;
  confidence: number;
  description: string;
}

export enum SafetyLevel {
  SAFE = "safe",
  CAUTION = "caution",
  DANGEROUS = "dangerous",
  BLOCKED = "blocked",
}

export enum SafetyFlag {
  NONE = "none",
  DESTRUCTIVE_OPERATION = "destructive_operation",
  SENSITIVE_DATA_ACCESS = "sensitive_data_access",
  EXTERNAL_COMMUNICATION = "external_communication",
  PRIVILEGE_ESCALATION = "privilege_escalation",
  MASS_DELETION = "mass_deletion",
  SYSTEM_MODIFICATION = "system_modification",
  CREDENTIAL_MANIPULATION = "credential_manipulation",
}

export interface IntentMetadata {
  entities: Entity[];
  timeReferences: TimeReference[];
  contextRequirements: string[];
  expectedOutputType: OutputType;
  complexity: IntentComplexity;
  language: string;
  sentiment: SentimentType;
}

export interface Entity {
  name: string;
  type: EntityType;
  confidence: number;
}

export enum EntityType {
  FILE = "file",
  DIRECTORY = "directory",
  FUNCTION = "function",
  CLASS = "class",
  VARIABLE = "variable",
  PROJECT = "project",
  TOOL = "tool",
  PERSON = "person",
  CONCEPT = "concept",
  URL = "url",
}

export interface TimeReference {
  expression: string;
  resolved?: string;
  type: "absolute" | "relative";
}

export enum OutputType {
  CODE = "code",
  TEXT = "text",
  FILE = "file",
  COMMAND = "command",
  ANALYSIS = "analysis",
  SUMMARY = "summary",
  LIST = "list",
  NONE = "none",
}

export enum IntentComplexity {
  SIMPLE = "simple",
  MODERATE = "moderate",
  COMPLEX = "complex",
  MULTI_STEP = "multi_step",
}

export enum SentimentType {
  NEUTRAL = "neutral",
  URGENT = "urgent",
  FRUSTRATED = "frustrated",
  EXPLORATORY = "exploratory",
  CONFIRMING = "confirming",
}

export interface ConversationContext {
  sessionId: string;
  currentGoal: string;
  goalHistory: GoalEntry[];
  recentMessages: ConversationMessage[];
  turnCount: number;
  lastIntent?: IntentRecognitionResult;
}

export interface GoalEntry {
  goal: string;
  timestamp: number;
  confidence: number;
  isActive: boolean;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface IntentRecognitionConfig {
  enableLLM: boolean;
  enableSafetyCheck: boolean;
  enableGoalTracking: boolean;
  goalPersistenceWeight: number;
  maxGoalHistory: number;
  safetyThreshold: SafetyLevel;
  language: string;
}

const DEFAULT_CONFIG: IntentRecognitionConfig = {
  enableLLM: true,
  enableSafetyCheck: true,
  enableGoalTracking: true,
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

  constructor(config?: Partial<IntentRecognitionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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
    return `你是一个意图识别专家，负责分析用户的真实意图。

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
  }
}

## 重要规则
1. 如果用户输入模糊，设置 requiresClarification 为 true
2. 安全等级必须保守评估
3. 实体类型从 file/directory/function/class/variable/project/tool/person/concept/url 中选择
4. 情感从 neutral/urgent/frustrated/exploratory/confirming 中选择
5. 输出类型从 code/text/file/command/analysis/summary/list/none 中选择`;
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

    let primaryIntent = IntentType.CONVERSATION;
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
