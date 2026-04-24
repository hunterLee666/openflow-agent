# 系统深度集成排查报告

## 排查时间: 2026-04-24

## 🔴 严重缺口 (P0)

### 缺口1: PromptCache 未传递给 SystemPromptBuilder
**文件**: `src/core/query-engine.ts`
**位置**: `buildSystemPrompt()` 函数 (约第265行)

```typescript
// 当前代码 - 未传递 cache
const builder = new DefaultSystemPromptBuilder();
const prompt = await builder.build({
  config: ctx.config,
  tools: ctx.toolRegistry.list(),
  memory: ctx.memory!,
  cwd: process.cwd(),
  turn: 0,
  sessionId: undefined,
});

// 应该是
const prompt = await builder.build({
  config: ctx.config,
  tools: ctx.toolRegistry.list(),
  memory: ctx.memory!,
  cwd: process.cwd(),
  turn: 0,
  sessionId: undefined,
}, ctx.promptCache);  // 传递 cache
```

### 缺口2: PermissionPipeline 未被 QueryEngine 调用
**文件**: `src/core/query-engine.ts`
**问题**: `PermissionPipeline` 已实现（含 `WorkspaceBoundaryValidator`），但 `QueryEngine` 从未使用它

**当前**: `FourteenStepGovernancePipeline.step6_permissionDecision` 只做简单 read-only 检查
**应该**: 使用完整的 `PermissionPipeline` 进行路径边界验证

### 缺口3: CommandRegistry 未用于命令解析
**文件**: `src/core/query-engine.ts`
**问题**: `CommandRegistry` 已初始化，但消息输入没有经过命令解析

**当前**: 用户消息直接作为查询处理
**应该**: 先检查是否以 `/` 开头，如果是则通过 `CommandRegistry.resolve()` 处理

---

## 🟡 中等缺口 (P1)

### 缺口4: WorkspaceBoundaryValidator 配置未传入 QueryContext
**文件**: `src/main.tsx`
**问题**: `workspaceValidator` 已创建但配置是硬编码的

```typescript
// 当前
workspaceValidator = new WorkspaceBoundaryValidator({
  boundaries: { root: process.cwd(), allowedPaths: [], deniedPaths: [...] }
});

// 应该从 config 加载或允许运行时配置
```

### 缺口5: initializeApp() 从未被调用
**文件**: `src/main.tsx`
**问题**: `initializeApp()` 函数已定义但从未被调用，导致 TaskAgent 工具未注册

---

## 🟢 轻微问题 (P2)

### 问题1: 未使用的导入
- `INTEGRATION_REPORT.md` 文件不应提交到仓库

### 问题2: main.tsx 中未使用的导入
```typescript
// 未使用
import { useEffect, useRef, useInput } from "react";
import type { StreamEvent, queryResultToUIMessage } from "./types/index.js";
```

---

## 修复优先级

### P0 - 必须修复
1. 修复 `buildSystemPrompt` 传递 `PromptCache`
2. 修复 `PermissionPipeline` 被 `QueryEngine` 使用
3. 修复 `CommandRegistry` 命令解析

### P1 - 应该修复
4. 修复 `initializeApp()` 调用
5. 修复 `WorkspaceBoundaryValidator` 配置

---

## 调用链路图（修复后）

```
main.tsx
  ├── initializeApp()  [未调用 - 需修复]
  │   └── 注册 TaskAgent Tools
  │
  ├── toolRegistry.register(TaskAgentTools)  [未调用]
  │
  └── createQueryContext()
      └── QueryContext
          ├── toolRegistry ✅
          ├── memory ✅
          ├── hooks ✅
          ├── promptCache ✅ [未传递 - 需修复]
          ├── commandRegistry ✅ [未使用 - 需修复]
          └── workspaceValidator ✅ [未使用 - 需修复]

query-engine.ts
  └── query()
      └── buildSystemPrompt(ctx)
          └── builder.build(ctx, ctx.promptCache)  [需修复]

      └── queryLoop()
          └── runSingleTool()
              └── FourteenStepGovernancePipeline
                  ├── step6_permissionDecision  [简单检查 - 需替换为 PermissionPipeline]
                  └── step8WorkspaceBoundary  [存在但未被调用]
```

---

## 建议修复步骤

### Step 1: 修复 buildSystemPrompt
```typescript
async function buildSystemPrompt(ctx: QueryContext): Promise<string> {
  const builder = new DefaultSystemPromptBuilder();
  const prompt = await builder.build({
    config: ctx.config,
    tools: ctx.toolRegistry.list(),
    memory: ctx.memory!,
    cwd: process.cwd(),
    turn: 0,
    sessionId: undefined,
  }, ctx.promptCache);  // 添加这行
  return prompt;
}
```

### Step 2: 修复 initializeApp 调用
在 main.tsx 的 CLI 入口或 ChatApp 组件中调用 `initializeApp()`

### Step 3: 集成 CommandRegistry
在 query() 函数开始时检查消息是否以 `/` 开头，如果是则先通过 CommandRegistry 处理

### Step 4: 集成 PermissionPipeline
将 PermissionPipeline 集成到 FourteenStepGovernancePipeline 或 QueryEngine 中
