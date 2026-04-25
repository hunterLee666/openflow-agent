# 重构核心模块文档

本文档描述 `refactored/core/` 目录下新增的核心模块功能、使用方法和最佳实践。

## 目录

- [14步工具治理管道](#14步工具治理管道)
- [Hook系统生命周期](#hook系统生命周期)
- [Tier3结构化摘要压缩](#tier3结构化摘要压缩)
- [消息序列化](#消息序列化)
- [Token自动刷新](#token自动刷新)
- [Token预算注入器](#token预算注入器)
- [系统提示词构建器](#系统提示词构建器)

---

## 14步工具治理管道

**位置**: `refactored/core/governance/`

### 功能概述

14步工具治理管道为所有工具调用提供完整的安全校验链，确保工具执行的安全性。

### 14步流程

| 步骤 | 名称 | 功能 |
|------|------|------|
| 1 | parseInput | 解析输入参数 |
| 2 | validateInput | Schema验证 |
| 3 | validateBusiness | 业务规则验证 |
| 4 | classifyRisk | 风险分类 |
| 5 | preToolUse | PreHook检查 |
| 6 | permissionDecision | 权限决策 |
| 7 | inputSanitize | 输入修正 |
| 8 | executeTool | 工具执行 |
| 9 | telemetry | 遥测记录 |
| 10 | postToolUse | PostHook检查 |
| 11 | structuredOutput | 结构化输出 |
| 12 | maskSensitive | 敏感字段脱敏 |
| 13 | compress | 输出压缩 |

### 使用示例

```typescript
import { FourteenStepGovernancePipeline } from "./refactored/core/governance/pipeline.js";
import type { GovernanceContext } from "./refactored/core/governance/types.js";

const pipeline = new FourteenStepGovernancePipeline(undefined, "medium");

const ctx: GovernanceContext = {
  cwd: process.cwd(),
  tool: "read",
  input: { path: "/tmp/test.txt" },
  isReadOnly: true,
  isDestructive: false,
  isNetworkAccess: false,
  isGitCommand: false,
  config: { maskSensitiveOutputs: true },
};

const result = await pipeline.execute(
  "read",
  { path: "/tmp/test.txt" },
  async (input) => readFile(input.path as string),
  ctx
);

if (result.status === "ok") {
  console.log("Tool executed successfully:", result.data);
} else {
  console.error("Tool execution denied:", result.reason);
}
```

### Bash安全分析器

```typescript
import { analyzeBashCommand } from "./refactored/core/governance/bash-analyzer.js";

const analysis = analyzeBashCommand("rm -rf /");
console.log(analysis.riskLevel); // "critical"
console.log(analysis.isDestructive); // true
```

### 敏感字段脱敏

```typescript
import { maskSensitiveData } from "./refactored/core/governance/masking.js";

const masked = maskSensitiveData("password=secret123 api_key=sk-123");
console.log(masked); // "password=[REDACTED] api_key=[REDACTED]"
```

---

## Hook系统生命周期

**位置**: `refactored/core/hooks/`

### 功能概述

Hook系统提供10种生命周期事件钩子，用于在关键节点执行自定义逻辑。

### 支持的事件类型

| 事件 | 触发时机 |
|------|----------|
| SessionStart | 会话开始 |
| SessionEnd | 会话结束 |
| UserPromptSubmit | 用户提交提示词 |
| AssistantResponseComplete | 助手响应完成 |
| ToolCallStart | 工具调用开始 |
| ToolCallEnd | 工具调用结束 |
| CompactionStart | 压缩开始 |
| CompactionEnd | 压缩结束 |
| Error | 错误发生 |
| BudgetWarning | 预算警告 |

### 使用示例

```typescript
import { createHookSystem, setupDefaultHooks } from "./refactored/core/hooks/index.js";
import type { HookContext } from "./refactored/core/hooks/hook-system.js";

const hookSystem = createHookSystem();
setupDefaultHooks(hookSystem);

// 注册自定义Hook
hookSystem.register({
  name: "my-custom-hook",
  event: "UserPromptSubmit",
  handler: async (ctx: HookContext) => {
    const prompt = ctx.metadata?.prompt as string;
    if (prompt.includes("dangerous")) {
      return { action: "block", message: "Dangerous prompt detected" };
    }
    return { action: "allow" };
  },
  priority: 10,
});

// 分发事件
const ctx: HookContext = {
  sessionId: "session-1",
  timestamp: Date.now(),
  metadata: { prompt: "help me write code" },
};

const results = await hookSystem.dispatch("UserPromptSubmit", ctx);
```

---

## Tier3结构化摘要压缩

**位置**: `refactored/core/compaction/tier3.ts`

### 功能概述

Tier3结构化摘要提供9维度的对话上下文总结，用于高效压缩长对话历史。

### 9个维度

| 维度 | 说明 |
|------|------|
| INTENT | 用户的最终交付目标 |
| CONCEPTS | 必须统一的术语/约束 |
| FILES | 主要涉及的文件路径 |
| ERRORS | 当前卡住的失败情况 |
| MESSAGES | 不能重写的用户引用 |
| TASKS | 待办列表及完成标准 |
| CURRENT FOCUS | 下一步最小行动 |
| ENVIRONMENT | 版本、分支、运行命令 |
| STRIPPED CoT | 链式思考移除后的结论 |

### 使用示例

```typescript
import { buildTier3SummaryPrompt, formatTier3Summary } from "./refactored/core/compaction/tier3.js";
import type { Tier3Summary } from "./refactored/core/compaction/tier3.js";

// 构建提示词
const messages = [
  { role: "user", content: "Help me fix a bug" },
  { role: "assistant", content: "What's the error?" },
  { role: "user", content: "TypeError: Cannot read property 'x'" },
];

const prompt = buildTier3SummaryPrompt(messages);
// 发送给LLM获取Tier3摘要

// 格式化摘要
const summary: Tier3Summary = {
  intent: "Fix TypeError",
  concepts: ["undefined property access"],
  files: [{ path: "src/app.ts", note: "Main file" }],
  errors: [{ title: "TypeError", repro: "Access x when undefined" }],
  messageHighlights: ["Cannot read property 'x'"],
  tasks: [{ id: "1", done: false, text: "Add null check" }],
  currentFocus: "Add null safety check",
  environment: "Node: v18.0.0",
  strippedCoT: { keptConclusions: ["Need null check"] },
};

const formatted = formatTier3Summary(summary);
console.log(formatted);
```

---

## 消息序列化

**位置**: `refactored/core/serialization/`

### 功能概述

提供消息的序列化/反序列化功能，支持JSON转换和文本提取。

### 使用示例

```typescript
import {
  serializeMessage,
  deserializeMessage,
  createUserMessage,
  createAssistantMessage,
  createToolResultMessage,
  createSystemMessage,
  messageToText,
  messageToJSON,
  parseMessageFromJSON,
} from "./refactored/core/serialization/index.js";

// 创建消息
const userMsg = createUserMessage("Hello world");
const assistantMsg = createAssistantMessage("Hi there");
const toolMsg = createToolResultMessage("tool-1", { result: "success" });
const systemMsg = createSystemMessage("You are a helpful assistant");

// 序列化
const serialized = serializeMessage(userMsg, "session-1");
console.log(serialized.id); // "msg_1234567890_1"
console.log(serialized.role); // "user"

// 反序列化
const deserialized = deserializeMessage(serialized);
console.log(deserialized.content); // "Hello world"

// JSON转换
const json = messageToJSON(userMsg);
const parsed = parseMessageFromJSON(json);

// 文本提取
const text = messageToText(userMsg);
console.log(text); // "Hello world"
```

---

## Token自动刷新

**位置**: `refactored/core/token/`

### 功能概述

Token自动刷新调度器，在Token过期前自动刷新，避免认证中断。

### 使用示例

```typescript
import { TokenRefreshScheduler, DEFAULT_TOKEN_REFRESH_CONFIG } from "./refactored/core/token/index.js";

// 创建调度器
const scheduler = new TokenRefreshScheduler(
  {
    refreshBeforeExpiryMs: 5 * 60 * 1000, // 过期前5分钟刷新
    defaultExpiryMs: 4 * 60 * 60 * 1000,  // 默认4小时过期
  },
  async () => {
    // 获取新Token的逻辑
    return await fetchNewToken();
  }
);

// 调度刷新
scheduler.schedule("session-1");

// 取消调度
scheduler.cancel("session-1");

// 取消所有调度
scheduler.cancelAll();

// 查询状态
console.log(scheduler.getPendingCount()); // 待刷新数量
console.log(scheduler.listPending()); // 待刷新会话列表
```

---

## Token预算注入器

**位置**: `refactored/core/compaction/token-budget.ts`

### 功能概述

Token预算注入器提供智能上下文管理，根据优先级和重要性选择最佳上下文片段。

### 核心功能

| 功能 | 说明 |
|------|------|
| setMaxTokens | 设置最大Token数 |
| getAvailableBudget | 获取可用预算 |
| estimateTokens | 估算Token数量 |
| buildContext | 构建上下文包 |
| compress | 压缩上下文 |
| getAllocationStats | 获取分配统计 |
| splitByBudget | 按预算分割 |

### 使用示例

```typescript
import { TokenBudgetInjector, estimateTokensClaude, estimateTokensGPT } from "./refactored/core/compaction/index.js";
import type { ContextSegment } from "./refactored/core/compaction/types.js";

// 创建注入器
const injector = new TokenBudgetInjector({
  maxTokens: 2000,
  reservedTokens: 200,
  enableCompression: true,
  compressionRatio: 0.7,
});

// 估算Token
const estimate = injector.estimateTokens("Hello world");
console.log(estimate.tokens); // 估算Token数

// 构建上下文
const segments: ContextSegment[] = [
  {
    id: "seg-1",
    content: "Important context",
    tokens: 100,
    priority: "high",
    importance: 0.9,
    source: "episodic",
    canExpand: false,
    summary: "Brief summary",
  },
];

const bundle = injector.buildContext("user query", segments);
console.log(bundle.totalTokens); // 总Token数
console.log(bundle.renderedContent); // 渲染后的内容

// 压缩
const compressed = injector.compress(segments);

// 统计
const stats = injector.getAllocationStats(segments);
console.log(stats.utilization); // 预算利用率

// 分割
const { primary, overflow } = injector.splitByBudget(segments);
```

### Token估算方法

```typescript
// Claude估算方法 (每4字符约1Token)
const claudeTokens = estimateTokensClaude("Hello world");

// GPT估算方法 (按词数*1.3)
const gptTokens = estimateTokensGPT("Hello world");
```

---

## 系统提示词构建器

**位置**: `refactored/core/prompts/`

### 功能概述

动态系统提示词构建器，支持静态/动态分层内容，带缓存优化。

### 使用示例

```typescript
import { DefaultSystemPromptBuilder } from "./refactored/core/prompts/system-prompt.js";
import type { PromptContext, PromptCache } from "./refactored/core/prompts/system-prompt.js";

const builder = new DefaultSystemPromptBuilder();

const ctx: PromptContext = {
  sessionId: "session-1",
  model: "claude-sonnet-4-5",
  capabilities: ["read", "write", "bash"],
  workingDirectory: process.cwd(),
};

const cache: PromptCache = new Map();

// 构建提示词
const prompt = await builder.build(ctx, cache);
console.log(prompt);

// 构建带缓存的提示词
const { prefix, dynamic } = await builder.buildCacheable(ctx, cache);
console.log("Static part:", prefix);
console.log("Dynamic part:", dynamic);
```

### 提示词层级

| 层级 | 稳定性 | 缓存 | 优先级 |
|------|--------|------|--------|
| identity | static | yes | 1 |
| core-principles | static | yes | 2 |
| safety-rules | static | yes | 3 |
| tool-capabilities | dynamic | no | 10 |
| context-aware | dynamic | no | 20 |

---

## 测试覆盖

所有模块都有完整的单元测试，运行以下命令执行测试：

```bash
bun test __tests__/unit/refactored/
```

### 测试文件

| 文件 | 测试内容 |
|------|----------|
| `governance.test.ts` | 14步治理管道 |
| `hooks.test.ts` | Hook系统 |
| `tier3-compaction.test.ts` | Tier3摘要压缩 |
| `serialization.test.ts` | 消息序列化 |
| `token-refresh.test.ts` | Token刷新 |
| `token-budget.test.ts` | Token预算注入器 |
