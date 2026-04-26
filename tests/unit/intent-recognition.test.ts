import { describe, it, expect, beforeEach } from "vitest";
import { IntentRecognizer, createIntentRecognizer, IntentType, SafetyLevel, SafetyFlag } from "../../src/memory/intent-recognizer.js";
import { GoalTracker, createGoalTracker } from "../../src/memory/goal-tracker.js";
import { SafetyChecker, createSafetyChecker } from "../../src/memory/safety-checker.js";

describe("Intent Recognition System", () => {
  describe("IntentRecognizer (规则模式)", () => {
    let recognizer: IntentRecognizer;

    beforeEach(() => {
      recognizer = createIntentRecognizer({ enableLLM: false });
    });

    it("should recognize code generation intent", async () => {
      const result = await recognizer.recognizeIntent("帮我写一个用户登录函数");

      expect(result.primaryIntent).toBe(IntentType.CODE_GENERATION);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.safetyLevel).toBe(SafetyLevel.SAFE);
    });

    it("should recognize debugging intent", async () => {
      const result = await recognizer.recognizeIntent("这个代码报错了，帮我调试一下");

      expect(result.primaryIntent).toBe(IntentType.DEBUGGING);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should recognize refactoring intent", async () => {
      const result = await recognizer.recognizeIntent("重构这个模块，优化性能");

      expect(result.primaryIntent).toBe(IntentType.REFACTORING);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should recognize testing intent", async () => {
      const result = await recognizer.recognizeIntent("给这个函数写测试用例");

      expect(result.primaryIntent).toBe(IntentType.TESTING);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should recognize deployment intent", async () => {
      const result = await recognizer.recognizeIntent("部署到生产环境");

      expect(result.primaryIntent).toBe(IntentType.DEPLOYMENT);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should recognize documentation intent", async () => {
      const result = await recognizer.recognizeIntent("写一下这个模块的文档");

      expect(result.primaryIntent).toBe(IntentType.DOCUMENTATION);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should recognize exploration intent", async () => {
      const result = await recognizer.recognizeIntent("查看项目结构，搜索相关文件");

      expect(result.primaryIntent).toBe(IntentType.EXPLORATION);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should default to conversation intent", async () => {
      const result = await recognizer.recognizeIntent("你好，今天天气怎么样");

      expect(result.primaryIntent).toBe(IntentType.CONVERSATION);
    });

    it("should detect Chinese language", async () => {
      const result = await recognizer.recognizeIntent("帮我写代码");

      expect(result.metadata.language).toBe("zh");
    });

    it("should detect English language", async () => {
      const result = await recognizer.recognizeIntent("Help me write code");

      expect(result.metadata.language).toBe("en");
    });

    it("should increase confidence with context goal", async () => {
      const context = {
        sessionId: "test-session",
        currentGoal: "实现用户认证系统",
        goalHistory: [],
        recentMessages: [],
        turnCount: 5,
      };

      const result = await recognizer.recognizeIntent("添加密码加密功能", context);

      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe("GoalTracker", () => {
    let tracker: GoalTracker;

    beforeEach(() => {
      tracker = createGoalTracker({ enableLLMGoalDetection: false });
    });

    it("should set initial goal when no current goal", async () => {
      const context = {
        sessionId: "test-session",
        currentGoal: "",
        goalHistory: [],
        recentMessages: [],
        turnCount: 0,
      };

      const intentResult = {
        primaryIntent: IntentType.CODE_GENERATION,
        confidence: 0.8,
        subIntents: [],
        goalDescription: "实现用户登录功能",
        safetyLevel: SafetyLevel.SAFE,
        safetyFlags: [],
        requiresClarification: false,
        metadata: {
          entities: [],
          timeReferences: [],
          contextRequirements: [],
          expectedOutputType: "code" as const,
          complexity: "moderate" as const,
          language: "zh",
          sentiment: "neutral" as const,
        },
      };

      const result = await tracker.updateGoal("实现用户登录功能", context, intentResult);

      expect(result.currentGoal).toBe("实现用户登录功能");
      expect(result.goalSwitched).toBe(true);
      expect(result.previousGoal).toBeNull();
    });

    it("should detect goal switch with keywords", async () => {
      const context = {
        sessionId: "test-session",
        currentGoal: "实现用户登录功能",
        goalHistory: [{
          goal: "实现用户登录功能",
          timestamp: Date.now(),
          confidence: 1.0,
          isActive: true,
        }],
        recentMessages: [],
        turnCount: 5,
      };

      const intentResult = {
        primaryIntent: IntentType.DEPLOYMENT,
        confidence: 0.8,
        subIntents: [],
        goalDescription: "部署前端应用",
        safetyLevel: SafetyLevel.SAFE,
        safetyFlags: [],
        requiresClarification: false,
        metadata: {
          entities: [],
          timeReferences: [],
          contextRequirements: [],
          expectedOutputType: "command" as const,
          complexity: "simple" as const,
          language: "zh",
          sentiment: "neutral" as const,
        },
      };

      const result = await tracker.updateGoal("换个任务，部署前端应用", context, intentResult);

      expect(result.goalSwitched).toBe(true);
      expect(result.previousGoal).toBe("实现用户登录功能");
      expect(result.switchConfidence).toBeGreaterThan(0.6);
    });

    it("should refine goal without switching", async () => {
      const context = {
        sessionId: "test-session",
        currentGoal: "实现用户登录功能",
        goalHistory: [{
          goal: "实现用户登录功能",
          timestamp: Date.now(),
          confidence: 1.0,
          isActive: true,
        }],
        recentMessages: [],
        turnCount: 5,
      };

      const intentResult = {
        primaryIntent: IntentType.CODE_GENERATION,
        confidence: 0.8,
        subIntents: [],
        goalDescription: "添加 JWT 验证",
        safetyLevel: SafetyLevel.SAFE,
        safetyFlags: [],
        requiresClarification: false,
        metadata: {
          entities: [],
          timeReferences: [],
          contextRequirements: [],
          expectedOutputType: "code" as const,
          complexity: "simple" as const,
          language: "zh",
          sentiment: "neutral" as const,
        },
      };

      const result = await tracker.updateGoal("添加 JWT 验证支持", context, intentResult);

      expect(result.goalSwitched).toBe(false);
      expect(result.previousGoal).toBeNull();
    });

    it("should detect goal switch with topic change", async () => {
      const context = {
        sessionId: "test-session",
        currentGoal: "实现用户登录功能使用 React 和 Node.js",
        goalHistory: [],
        recentMessages: [],
        turnCount: 5,
      };

      const intentResult = {
        primaryIntent: IntentType.DEPLOYMENT,
        confidence: 0.8,
        subIntents: [],
        goalDescription: "配置 Kubernetes 集群",
        safetyLevel: SafetyLevel.SAFE,
        safetyFlags: [],
        requiresClarification: false,
        metadata: {
          entities: [],
          timeReferences: [],
          contextRequirements: [],
          expectedOutputType: "command" as const,
          complexity: "complex" as const,
          language: "zh",
          sentiment: "neutral" as const,
        },
      };

      const result = await tracker.updateGoal("配置 Kubernetes 集群部署", context, intentResult);

      expect(result.goalSwitched).toBe(true);
    });
  });

  describe("SafetyChecker", () => {
    let checker: SafetyChecker;

    beforeEach(() => {
      checker = createSafetyChecker({ enableLLMCheck: false });
    });

    it("should block dangerous commands", async () => {
      const intentResult = {
        primaryIntent: IntentType.SYSTEM_OPERATION,
        confidence: 0.8,
        subIntents: [],
        goalDescription: "删除所有文件",
        safetyLevel: SafetyLevel.SAFE,
        safetyFlags: [],
        requiresClarification: false,
        metadata: {
          entities: [],
          timeReferences: [],
          contextRequirements: [],
          expectedOutputType: "command" as const,
          complexity: "simple" as const,
          language: "zh",
          sentiment: "neutral" as const,
        },
      };

      const result = await checker.check("rm -rf /", intentResult);

      expect(result.level).toBe(SafetyLevel.BLOCKED);
      expect(result.blockMessage).toBeDefined();
    });

    it("should warn on file deletion", async () => {
      const intentResult = {
        primaryIntent: IntentType.FILE_OPERATION,
        confidence: 0.8,
        subIntents: [],
        goalDescription: "删除临时文件",
        safetyLevel: SafetyLevel.SAFE,
        safetyFlags: [],
        requiresClarification: false,
        metadata: {
          entities: [],
          timeReferences: [],
          contextRequirements: [],
          expectedOutputType: "command" as const,
          complexity: "simple" as const,
          language: "zh",
          sentiment: "neutral" as const,
        },
      };

      const result = await checker.check("rm -rf ./temp", intentResult);

      expect(result.level).toBe(SafetyLevel.CAUTION);
      expect(result.requiresConfirmation).toBe(true);
    });

    it("should warn on sudo commands", async () => {
      const intentResult = {
        primaryIntent: IntentType.SYSTEM_OPERATION,
        confidence: 0.8,
        subIntents: [],
        goalDescription: "安装系统包",
        safetyLevel: SafetyLevel.SAFE,
        safetyFlags: [],
        requiresClarification: false,
        metadata: {
          entities: [],
          timeReferences: [],
          contextRequirements: [],
          expectedOutputType: "command" as const,
          complexity: "simple" as const,
          language: "zh",
          sentiment: "neutral" as const,
        },
      };

      const result = await checker.check("sudo apt-get install nginx", intentResult);

      expect(result.level).toBe(SafetyLevel.CAUTION);
      expect(result.flags).toContain(SafetyFlag.PRIVILEGE_ESCALATION);
    });

    it("should allow safe commands", async () => {
      const intentResult = {
        primaryIntent: IntentType.EXPLORATION,
        confidence: 0.8,
        subIntents: [],
        goalDescription: "查看文件列表",
        safetyLevel: SafetyLevel.SAFE,
        safetyFlags: [],
        requiresClarification: false,
        metadata: {
          entities: [],
          timeReferences: [],
          contextRequirements: [],
          expectedOutputType: "text" as const,
          complexity: "simple" as const,
          language: "zh",
          sentiment: "neutral" as const,
        },
      };

      const result = await checker.check("ls -la", intentResult);

      expect(result.level).toBe(SafetyLevel.SAFE);
      expect(result.requiresConfirmation).toBe(false);
    });

    it("should block after max destructive operations", async () => {
      const intentResult = {
        primaryIntent: IntentType.FILE_OPERATION,
        confidence: 0.8,
        subIntents: [],
        goalDescription: "删除文件",
        safetyLevel: SafetyLevel.SAFE,
        safetyFlags: [],
        requiresClarification: false,
        metadata: {
          entities: [],
          timeReferences: [],
          contextRequirements: [],
          expectedOutputType: "command" as const,
          complexity: "simple" as const,
          language: "zh",
          sentiment: "neutral" as const,
        },
      };

      await checker.check("rm file1.txt", intentResult);
      await checker.check("rm file2.txt", intentResult);
      await checker.check("rm file3.txt", intentResult);
      const result = await checker.check("rm file4.txt", intentResult);

      expect(result.level).toBe(SafetyLevel.BLOCKED);
    });

    it("should reset destructive count", async () => {
      const intentResult = {
        primaryIntent: IntentType.FILE_OPERATION,
        confidence: 0.8,
        subIntents: [],
        goalDescription: "删除文件",
        safetyLevel: SafetyLevel.SAFE,
        safetyFlags: [],
        requiresClarification: false,
        metadata: {
          entities: [],
          timeReferences: [],
          contextRequirements: [],
          expectedOutputType: "command" as const,
          complexity: "simple" as const,
          language: "zh",
          sentiment: "neutral" as const,
        },
      };

      await checker.check("rm file1.txt", intentResult);
      await checker.check("rm file2.txt", intentResult);
      checker.resetDestructiveCount();
      const result = await checker.check("rm file3.txt", intentResult);

      expect(result.level).toBe(SafetyLevel.CAUTION);
      expect(result.level).not.toBe(SafetyLevel.BLOCKED);
    });
  });
});
