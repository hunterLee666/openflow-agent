import { IntentType } from "./intent-recognizer.js";
import type { ConversationContext, GoalEntry, IntentRecognitionResult } from "./intent-recognizer.js";

export interface GoalTrackerConfig {
  goalPersistenceWeight: number;
  maxGoalHistory: number;
  goalSwitchThreshold: number;
  enableLLMGoalDetection: boolean;
}

export interface GoalUpdateResult {
  currentGoal: string;
  goalSwitched: boolean;
  previousGoal: string | null;
  switchConfidence: number;
  goalEntries: GoalEntry[];
}

const DEFAULT_CONFIG: GoalTrackerConfig = {
  goalPersistenceWeight: 0.7,
  maxGoalHistory: 20,
  goalSwitchThreshold: 0.6,
  enableLLMGoalDetection: true,
};

export class GoalTracker {
  private config: GoalTrackerConfig;
  private llmClient: any;

  constructor(config?: Partial<GoalTrackerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setLLMClient(client: any): void {
    this.llmClient = client;
  }

  async updateGoal(
    userInput: string,
    context: ConversationContext,
    intentResult: IntentRecognitionResult,
    persistenceWeight?: number
  ): Promise<GoalUpdateResult> {
    const weight = persistenceWeight ?? this.config.goalPersistenceWeight;
    const currentGoal = context.currentGoal;

    if (!currentGoal) {
      const newGoal = await this.extractGoal(userInput, intentResult);
      return {
        currentGoal: newGoal,
        goalSwitched: true,
        previousGoal: null,
        switchConfidence: 1.0,
        goalEntries: [{
          goal: newGoal,
          timestamp: Date.now(),
          confidence: 1.0,
          isActive: true,
        }],
      };
    }

    const isGoalSwitch = await this.detectGoalSwitch(
      userInput,
      currentGoal,
      intentResult,
      context
    );

    if (isGoalSwitch.confidence > this.config.goalSwitchThreshold) {
      const newGoal = await this.extractGoal(userInput, intentResult);

      const updatedHistory = context.goalHistory.map((entry) => ({
        ...entry,
        isActive: false,
      }));

      updatedHistory.push({
        goal: newGoal,
        timestamp: Date.now(),
        confidence: isGoalSwitch.confidence,
        isActive: true,
      });

      const trimmedHistory = updatedHistory.slice(-this.config.maxGoalHistory);

      return {
        currentGoal: newGoal,
        goalSwitched: true,
        previousGoal: currentGoal,
        switchConfidence: isGoalSwitch.confidence,
        goalEntries: trimmedHistory,
      };
    }

    const refinedGoal = await this.refineGoal(currentGoal, userInput, intentResult, weight);

    const updatedHistory = context.goalHistory.map((entry) => {
      if (entry.isActive && entry.goal === currentGoal) {
        return {
          ...entry,
          goal: refinedGoal,
          confidence: Math.min(1.0, entry.confidence + 0.05),
        };
      }
      return entry;
    });

    return {
      currentGoal: refinedGoal,
      goalSwitched: false,
      previousGoal: null,
      switchConfidence: 0.0,
      goalEntries: updatedHistory,
    };
  }

  private async detectGoalSwitch(
    userInput: string,
    currentGoal: string,
    intentResult: IntentRecognitionResult,
    context: ConversationContext
  ): Promise<{ confidence: number; reason: string }> {
    const lowerInput = userInput.toLowerCase();

    const switchIndicators = [
      "换个", "换一个", "另外", "新的", "新任务", "不做了",
      "算了", "不管了", "switch", "change", "new task",
      "forget", "ignore", "skip", "move on", "next",
    ];

    for (const indicator of switchIndicators) {
      if (lowerInput.includes(indicator)) {
        return { confidence: 0.9, reason: `包含目标切换关键词: ${indicator}` };
      }
    }

    const topicChange = this.calculateTopicChange(userInput, currentGoal);
    if (topicChange > 0.85) {
      const intentAlignment = this.checkIntentAlignmentFromResult(intentResult, currentGoal);
      if (intentAlignment >= 0.6) {
        return { confidence: 0.3, reason: "虽然话题变化但意图对齐，可能是目标微调" };
      }
      if (context.lastIntent) {
        const sessionAlignment = this.checkIntentAlignment(intentResult, context);
        if (sessionAlignment >= 0.7) {
          return { confidence: 0.3, reason: "虽然话题变化但意图对齐，可能是目标微调" };
        }
      }
      return { confidence: topicChange, reason: "话题变化超过阈值" };
    }

    const intentMismatch = this.checkIntentMismatch(intentResult, context);
    if (intentMismatch > 0.6) {
      return { confidence: intentMismatch, reason: "意图与当前目标不匹配" };
    }

    if (this.config.enableLLMGoalDetection && this.llmClient) {
      try {
        const llmResult = await this.detectGoalSwitchWithLLM(userInput, currentGoal);
        return llmResult;
      } catch {
        // Fall back to rule-based detection
      }
    }

    return { confidence: 0.1, reason: "无明显切换信号" };
  }

  private calculateTopicChange(userInput: string, currentGoal: string): number {
    const hasChinese = /[\u4e00-\u9fff]/.test(userInput) || /[\u4e00-\u9fff]/.test(currentGoal);

    if (hasChinese) {
      const inputChars = new Set(userInput.replace(/\s+/g, "").split(""));
      const goalChars = new Set(currentGoal.replace(/\s+/g, "").split(""));

      const intersection = new Set([...inputChars].filter((c) => goalChars.has(c)));
      const union = new Set([...inputChars, ...goalChars]);

      if (union.size === 0) return 0;

      const similarity = intersection.size / union.size;
      return 1 - similarity;
    }

    const inputWords = new Set(userInput.toLowerCase().split(/\s+/));
    const goalWords = new Set(currentGoal.toLowerCase().split(/\s+/));

    const intersection = new Set([...inputWords].filter((w) => goalWords.has(w)));
    const union = new Set([...inputWords, ...goalWords]);

    if (union.size === 0) return 0;

    const similarity = intersection.size / union.size;
    return 1 - similarity;
  }

  private checkIntentMismatch(
    intentResult: IntentRecognitionResult,
    context: ConversationContext
  ): number {
    if (!context.lastIntent) return 0;

    const currentIntent = intentResult.primaryIntent;
    const lastIntent = context.lastIntent.primaryIntent;

    const intentGroups: Record<string, IntentType[]> = {
      development: [IntentType.CODE_GENERATION, IntentType.DEBUGGING, IntentType.REFACTORING, IntentType.TESTING],
      exploration: [IntentType.EXPLORATION, IntentType.DOCUMENTATION, IntentType.CODE_REVIEW],
      operation: [IntentType.DEPLOYMENT, IntentType.CONFIGURATION, IntentType.FILE_OPERATION, IntentType.SYSTEM_OPERATION],
      memory: [IntentType.MEMORY_QUERY, IntentType.MEMORY_WRITE],
      planning: [IntentType.TASK_PLANNING],
      conversation: [IntentType.CONVERSATION],
    };

    const currentGroup = this.findIntentGroup(currentIntent, intentGroups);
    const lastGroup = this.findIntentGroup(lastIntent, intentGroups);

    if (currentGroup === lastGroup) return 0;
    if (currentGroup === "conversation" || lastGroup === "conversation") return 0.3;

    return 0.6;
  }

  private checkIntentAlignment(
    intentResult: IntentRecognitionResult,
    context: ConversationContext
  ): number {
    if (!context.lastIntent) return 0.5;

    const currentIntent = intentResult.primaryIntent;
    const lastIntent = context.lastIntent.primaryIntent;

    const intentGroups: Record<string, IntentType[]> = {
      development: [IntentType.CODE_GENERATION, IntentType.DEBUGGING, IntentType.REFACTORING, IntentType.TESTING],
      exploration: [IntentType.EXPLORATION, IntentType.DOCUMENTATION, IntentType.CODE_REVIEW],
      operation: [IntentType.DEPLOYMENT, IntentType.CONFIGURATION, IntentType.FILE_OPERATION, IntentType.SYSTEM_OPERATION],
      memory: [IntentType.MEMORY_QUERY, IntentType.MEMORY_WRITE],
      planning: [IntentType.TASK_PLANNING],
      conversation: [IntentType.CONVERSATION],
    };

    const currentGroup = this.findIntentGroup(currentIntent, intentGroups);
    const lastGroup = this.findIntentGroup(lastIntent, intentGroups);

    if (currentGroup === lastGroup) return 1.0;
    if (currentGroup === "development" && lastGroup === "development") return 0.8;
    if (currentGroup === "conversation" || lastGroup === "conversation") return 0.5;

    return 0.2;
  }

  private checkIntentAlignmentFromResult(
    intentResult: IntentRecognitionResult,
    currentGoal: string
  ): number {
    const intentGroups: Record<string, IntentType[]> = {
      development: [IntentType.CODE_GENERATION, IntentType.DEBUGGING, IntentType.REFACTORING, IntentType.TESTING],
      exploration: [IntentType.EXPLORATION, IntentType.DOCUMENTATION, IntentType.CODE_REVIEW],
      operation: [IntentType.DEPLOYMENT, IntentType.CONFIGURATION, IntentType.FILE_OPERATION, IntentType.SYSTEM_OPERATION],
      memory: [IntentType.MEMORY_QUERY, IntentType.MEMORY_WRITE],
      planning: [IntentType.TASK_PLANNING],
      conversation: [IntentType.CONVERSATION],
    };

    const currentGroup = this.findIntentGroup(intentResult.primaryIntent, intentGroups);

    const goalLower = currentGoal.toLowerCase();
    let goalGroup = "unknown";
    if (goalLower.includes("开发") || goalLower.includes("实现") || goalLower.includes("写") || goalLower.includes("功能") || goalLower.includes("代码")) {
      goalGroup = "development";
    } else if (goalLower.includes("查看") || goalLower.includes("搜索") || goalLower.includes("文档")) {
      goalGroup = "exploration";
    } else if (goalLower.includes("部署") || goalLower.includes("配置") || goalLower.includes("安装")) {
      goalGroup = "operation";
    } else if (goalLower.includes("记忆") || goalLower.includes("memory")) {
      goalGroup = "memory";
    } else if (goalLower.includes("计划") || goalLower.includes("规划")) {
      goalGroup = "planning";
    }

    if (currentGroup === goalGroup) return 1.0;
    if (currentGroup === "development" && goalGroup === "development") return 0.8;
    if (currentGroup === "conversation" || goalGroup === "conversation") return 0.5;

    return 0.3;
  }

  private findIntentGroup(intent: IntentType, groups: Record<string, IntentType[]>): string {
    for (const [group, intents] of Object.entries(groups)) {
      if (intents.includes(intent)) return group;
    }
    return "unknown";
  }

  private async detectGoalSwitchWithLLM(
    userInput: string,
    currentGoal: string
  ): Promise<{ confidence: number; reason: string }> {
    const prompt = `当前目标: "${currentGoal}"
用户新输入: "${userInput}"

判断用户是否切换了目标，输出 JSON:
{"switched": true/false, "confidence": 0.0-1.0, "reason": "原因"}`;

    const response = await this.llmClient.complete({
      messages: [
        { role: "system", content: "你是一个目标切换检测专家。" },
        { role: "user", content: prompt },
      ],
      maxTokens: 256,
      temperature: 0.1,
    });

    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          confidence: parsed.switched ? (parsed.confidence ?? 0.8) : 0.1,
          reason: parsed.reason || "LLM 判断",
        };
      }
    } catch {
      // Fall back
    }

    return { confidence: 0.5, reason: "LLM 判断失败" };
  }

  private async extractGoal(
    userInput: string,
    intentResult: IntentRecognitionResult
  ): Promise<string> {
    if (intentResult.goalDescription) {
      return intentResult.goalDescription;
    }

    if (this.config.enableLLMGoalDetection && this.llmClient) {
      try {
        const prompt = `从以下用户输入中提取核心目标，用一句话描述:
"${userInput}"

输出 JSON: {"goal": "目标描述"}`;

        const response = await this.llmClient.complete({
          messages: [
            { role: "system", content: "你是一个目标提取专家。" },
            { role: "user", content: prompt },
          ],
          maxTokens: 128,
          temperature: 0.1,
        });

        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.goal || userInput.slice(0, 100);
        }
      } catch {
        // Fall back
      }
    }

    return userInput.slice(0, 100);
  }

  private async refineGoal(
    currentGoal: string,
    userInput: string,
    intentResult: IntentRecognitionResult,
    persistenceWeight: number
  ): Promise<string> {
    if (this.config.enableLLMGoalDetection && this.llmClient) {
      try {
        const prompt = `当前目标: "${currentGoal}"
用户新输入: "${userInput}"

请根据用户输入微调当前目标，输出 JSON:
{"refinedGoal": "微调后的目标"}`;

        const response = await this.llmClient.complete({
          messages: [
            { role: "system", content: "你是一个目标微调专家。根据用户输入微调当前目标，保持核心目标不变。" },
            { role: "user", content: prompt },
          ],
          maxTokens: 128,
          temperature: 0.1,
        });

        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.refinedGoal || currentGoal;
        }
      } catch {
        // Fall back
      }
    }

    const refinementWeight = 1 - persistenceWeight;
    if (refinementWeight > 0.3) {
      return `${currentGoal}（补充: ${userInput.slice(0, 50)}）`;
    }

    return currentGoal;
  }
}

export function createGoalTracker(config?: Partial<GoalTrackerConfig>): GoalTracker {
  return new GoalTracker(config);
}
