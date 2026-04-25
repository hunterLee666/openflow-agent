# OpenFlow CLI 可拔插架构重构方案

> **系统定位**: 具有顶级编程能力的个人助手  
> **核心原则**: 编程能力是基础，所有其他能力可拔插  
> **设计日期**: 2026-04-25

---

## 目录

1. [当前工程现状分析](#一当前工程现状分析)
2. [目标架构设计](#二目标架构设计)
3. [可拔插能力协议设计](#三可拔插能力协议设计)
4. [核心层设计（保留的必要功能）](#四核心层设计保留的必要功能)
5. [HermesAgent 特性集成方案](#五hermesagent-特性集成方案)
6. [插件目录结构](#六插件目录结构)
7. [重构实施路径](#七重构实施路径)
8. [关键代码示例](#八关键代码示例)
9. [迁移策略](#九迁移策略)
10. [预期收益](#十预期收益)
11. [详细模块设计](#十一详细模块设计)
12. [类型定义完整清单](#十二类型定义完整清单)

---

## 一、当前工程现状分析

### 1.1 现有架构问题

| 问题 | 现状 | 影响 |
|------|------|------|
| 能力硬编码 | Skill、Tool、Command、Agent 都以内置方式注册 | 无法按需加载，启动慢，内存占用大 |
| 模块耦合 | `integration/index.ts` 将所有服务耦合在一起 | 难以独立替换或扩展 |
| 记忆系统臃肿 | `memory/` 下有 15+ 文件，但很多功能重叠 | 维护成本高，实际使用率低 |
| 插件系统不完善 | `plugins/` 只能加载静态文件，无运行时注册能力 | 插件生态受限 |
| 缺少能力生命周期管理 | 无统一的 enable/disable/hot-reload 机制 | 用户体验差 |
| 无自我学习能力 | 任务完成后不沉淀经验 | 每次从零开始，无法累积能力 |

### 1.2 核心资产（需保留）

- **编程工具链**: 文件读写、代码搜索、Git 操作、LSP 集成
- **安全体系**: 沙箱执行、权限管道、工作区边界
- **状态管理**: React Store、持久化、副作用同步
- **查询引擎**: 流式事件处理、LLM 统一客户端

### 1.3 现有模块统计

| 目录 | 文件数 | 状态 | 重构策略 |
|------|--------|------|----------|
| `backend/skills/` | 3 | 硬编码 | 迁移为插件协议 |
| `backend/tools/` | 14 | 部分内置 | 编程工具保留，其余插件化 |
| `backend/commands/` | 6 | 硬编码 | 迁移为插件协议 |
| `backend/plugins/` | 6 | 不完善 | 重构为统一发现机制 |
| `backend/agent/` | 10 | 耦合 | 解耦为 Agent 插件 |
| `backend/memory/` | 15 | 臃肿 | 精简为三层架构 |
| `backend/security/` | 4 | 良好 | 保留为核心 |
| `backend/state/` | 9 | 良好 | 保留为核心 |
| `backend/core/` | 3 | 良好 | 扩展能力管理 |

---

## 二、目标架构设计

### 2.1 架构分层

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend Layer (UI)                          │
│  TUI Components / Layout / Theme / Events                       │
│                                                                 │
│  职责: 用户交互、渲染、事件处理                                    │
│  依赖: 后端 Core Runtime                                         │
├─────────────────────────────────────────────────────────────────┤
│               Capability Runtime (可拔插层)                      │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Skills  │ │  Tools   │ │ Commands │ │  Agents  │           │
│  │ Plugin   │ │ Plugin   │ │ Plugin   │ │ Plugin   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────────┐ ┌──────────────┐                              │
│  │ Memory       │ │ Output       │                              │
│  │ Strategy     │ │ Style        │                              │
│  │ Plugin       │ │ Plugin       │                              │
│  └──────────────┘ └──────────────┘                              │
│                                                                 │
│  特征: 按需加载、热插拔、独立版本、独立分发                         │
├─────────────────────────────────────────────────────────────────┤
│                  Core Runtime (核心层)                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Capability Manager (能力管理器)                          │    │
│  │  - Registry / Lifecycle / Discovery / Hot-Reload        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Security │ │  State   │ │  Query   │ │  Memory  │           │
│  │  Engine  │ │  Manager │ │  Engine  │ │  Core    │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Built-in Coding Tools (内置编程工具集)                    │    │
│  │  read_file / write_file / search / git / lsp / bash     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  特征: 必须存在、不可卸载、最小化、稳定 API                        │
├─────────────────────────────────────────────────────────────────┤
│               Infrastructure Layer (基础设施层)                   │
│                                                                 │
│  LLM Client / Transport / Cache / Telemetry / Auth              │
│                                                                 │
│  特征: 底层服务、协议适配、资源管理                                │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

1. **编程能力是基础**: 文件操作、代码搜索、Git、LSP 等编程工具内置于 Core，不可卸载
2. **所有其他能力可拔插**: Skill、Command、Agent、记忆策略、甚至 UI 主题都是插件
3. **统一插件协议**: 所有扩展遵循同一套 `CapabilityPlugin` 接口
4. **运行时热加载**: 支持启用/禁用/热更新，无需重启
5. **自我进化**: 集成 HermesAgent 的学习循环机制，越用越强
6. **安全优先**: 权限审批、沙箱隔离、路径遍历防护内置于 Core

### 2.3 依赖规则

```
Frontend Layer
    ↓ (单向依赖)
Capability Runtime
    ↓ (单向依赖)
Core Runtime
    ↓ (单向依赖)
Infrastructure Layer
```

- 上层可以依赖下层
- 下层不能依赖上层
- 同层模块间通过接口解耦
- 插件之间通过 CapabilityContext 通信，不直接依赖

---

## 三、可拔插能力协议设计

### 3.1 统一能力类型枚举

```typescript
export enum CapabilityType {
  SKILL = "skill",                    // 技能：复杂任务流程
  TOOL = "tool",                      // 工具：原子操作
  COMMAND = "command",                // 命令：斜杠命令
  AGENT = "agent",                    // Agent：自主决策体
  MEMORY_STRATEGY = "memory_strategy", // 记忆策略
  OUTPUT_STYLE = "output_style",      // 输出样式
}
```

### 3.2 能力清单 (Manifest)

```typescript
export interface CapabilityManifest {
  name: string;                       // 唯一标识
  version: string;                    // 语义化版本
  type: CapabilityType;               // 能力类型
  description: string;                // 描述
  author?: string;                    // 作者
  license?: string;                   // 许可证
  dependencies?: string[];            // 依赖的其他能力
  triggers?: string[];                // 触发关键词
  allowedTools?: string[];            // 允许使用的工具白名单
  requiredPermissions?: string[];     // 需要的权限
  tags?: string[];                    // 标签
}
```

### 3.3 能力插件接口

```typescript
export interface CapabilityPlugin<T = unknown> {
  manifest: CapabilityManifest;       // 清单

  activate(ctx: CapabilityContext): Promise<T>;  // 激活
  deactivate?(): Promise<void>;       // 停用（可选）
  healthCheck?(): Promise<boolean>;   // 健康检查（可选）

  // 生命周期钩子（可选）
  onBeforeActivate?(): Promise<void>;
  onAfterActivate?(): Promise<void>;
  onBeforeDeactivate?(): Promise<void>;
  onAfterDeactivate?(): Promise<void>;
}
```

### 3.4 能力上下文 (CapabilityContext)

```typescript
export interface CapabilityContext {
  // 核心服务注入
  llm: LLMClient;                     // LLM 客户端
  tools: ToolRegistry;                // 工具注册表
  memory: MemoryCore;                 // 记忆核心
  state: StateManager;                // 状态管理
  security: SecurityEngine;           // 安全引擎
  telemetry: TelemetryService;        // 遥测服务
  workspace: WorkspaceContext;        // 工作区上下文

  // 事件通信
  emit(event: string, payload: unknown): void;
  on(event: string, handler: (payload: unknown) => void): void;
  once(event: string, handler: (payload: unknown) => void): void;
  off(event: string, handler: (payload: unknown) => void): void;
}
```

### 3.5 能力状态机

```
                    ┌──────────┐
                    │  LOADED  │ ← 初始状态，已注册但未激活
                    └────┬─────┘
                         │ enable()
                         ▼
                    ┌───────────┐
              ┌────►│ ACTIVATED │ ← 运行中
              │     └─────┬─────┘
              │           │ disable()
              │           ▼
              │     ┌──────────┐
              │     │ DISABLED │ ← 已停用
              │     └────┬─────┘
              │          │ enable()
              │          └──────────┐
              │                     │
              │     ┌──────────┐   │
              └─────│  ERROR   │   │
                    └──────────┘
                    激活失败或运行时错误
```

---

## 四、核心层设计（保留的必要功能）

### 4.1 Core 模块清单

| 模块 | 文件路径 | 职责 | 是否内置 |
|------|----------|------|----------|
| Query Engine | `core/query-engine.ts` | LLM 查询流式处理 | 是 |
| Capability Manager | `core/capability-manager.ts` | 能力生命周期管理 | 是 |
| Plugin Discovery | `core/plugin-discovery.ts` | 插件发现与加载 | 是 |
| Context Factory | `core/context-factory.ts` | 能力上下文工厂 | 是 |
| Workspace | `core/workspace.ts` | 工作区管理、路径解析 | 是 |
| Sandbox | `security/sandbox.ts` | 沙箱执行 | 是 |
| Permission Pipeline | `permissions/pipeline.ts` | 权限审批管道 | 是 |
| Workspace Boundary | `security/workspace-boundary.ts` | 工作区边界 | 是 |
| State Store | `state/store.ts` | 状态管理核心 | 是 |
| State Persistence | `state/persistence/manager.ts` | 状态持久化 | 是 |
| LLM Unified Client | `services/api/unified-client.ts` | LLM 统一客户端 | 是 |
| Transport | `services/transport/transport.ts` | 传输层 | 是 |
| File Tools | `core/coding-tools/file-tools.ts` | 文件读写 | 是（编程基础） |
| Search Tools | `core/coding-tools/search-tools.ts` | 代码搜索 | 是（编程基础） |
| Git Tools | `core/coding-tools/git-tools.ts` | Git 操作 | 是（编程基础） |
| LSP Client | `core/coding-tools/lsp-tools.ts` | LSP 集成 | 是（编程基础） |
| Bash Tools | `core/coding-tools/bash-tools.ts` | 终端执行 | 是（编程基础） |

### 4.2 内置编程工具集

```typescript
export const BUILTIN_CODING_TOOLS = [
  // 文件操作
  "read_file",
  "write_file",
  "edit_file",
  "patch_file",
  "list_directory",

  // 代码搜索
  "search_files",
  "grep_code",
  "find_file",

  // Git 操作
  "git_status",
  "git_diff",
  "git_commit",
  "git_branch",
  "git_log",
  "git_checkout",

  // LSP 集成
  "lsp_diagnostics",
  "lsp_definition",
  "lsp_references",
  "lsp_rename",
  "lsp_hover",

  // 终端执行
  "run_command",
  "run_background",
  "process_list",
  "process_kill",
];
```

### 4.3 安全核心

```typescript
// 权限模式
export type PermissionMode = "acceptAll" | "acceptEdits" | "askUser" | "readonly";

// 沙箱后端
export type SandboxBackend = "bubblewrap" | "sandbox-exec" | "none";

// 权限管道
export interface PermissionPipeline {
  check(command: string, context: PermissionContext): Promise<PermissionDecision>;
  addRule(rule: PermissionRule): void;
  removeRule(id: string): void;
  listRules(): PermissionRule[];
}

// 工作区边界
export interface WorkspaceBoundary {
  pathPattern: RegExp;
  action: "allow" | "deny" | "ask";
  reason?: string;
}
```

---

## 五、HermesAgent 特性集成方案

### 5.1 自我进化学习循环

```
┌─────────────────────────────────────────────────────────────┐
│                    Hermes 学习循环                           │
│                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                 │
│  │ 接收任务 │───►│ 检索记忆 │───►│ 推理执行 │                 │
│  └─────────┘    └─────────┘    └────┬────┘                 │
│       ▲                              │                      │
│       │                              ▼                      │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                 │
│  │ 持续优化 │◄───│ 沉淀技能 │◄───│ 记录结果 │                 │
│  └─────────┘    └─────────┘    └─────────┘                 │
│                                                             │
│  关键指标: 20+ 自创技能后，相似任务完成速度提升 40%            │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 三层记忆架构

```
┌─────────────────────────────────────────────────────────────┐
│                    三层记忆架构                               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 短期记忆 (Working Memory)                            │    │
│  │ - 当前会话上下文                                     │    │
│  │ - 最近工具调用结果                                   │    │
│  │ - 任务栈                                             │    │
│  │ - 生命周期: 会话结束即清除                            │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                 │
│                           │ 定期评估                         │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 程序记忆 (Procedural Memory)                         │    │
│  │ - 技能文档 (agentskills.io 标准)                     │    │
│  │ - 渐进式披露: Level 0/1/2                            │    │
│  │ - 自动创建 + 自我改进                                │    │
│  │ - 生命周期: 持久化，可手动删除                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                 │
│                           │ 语义索引                         │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 长期记忆 (Semantic Memory)                           │    │
│  │ - 环境事实 (MEMORY.md)                               │    │
│  │ - 用户偏好 (USER.md)                                 │    │
│  │ - FTS5 全文检索 + 向量索引                           │    │
│  │ - LLM 摘要压缩                                       │    │
│  │ - 生命周期: 永久持久化                                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 技能自动学习系统

```typescript
// 技能文档结构 (agentskills.io 标准)
export interface SkillDocument {
  frontmatter: {
    name: string;
    description: string;
    triggers: string[];
    allowedTools: string[];
    version: string;
    createdAt: string;
    updatedAt: string;
    usageCount: number;
  };
  // Level 0: ~3000 tokens 概要
  overview: string;
  // Level 1: 完整内容
  body: string;
  // Level 2: 参考材料
  references: ReferenceMaterial[];
}

// 技能学习器
export class SkillLearner {
  // 任务完成后自动提炼技能
  async distillSkill(taskResult: TaskResult): Promise<SkillDocument>;

  // 技能自我改进：使用中持续优化
  async improveSkill(skillId: string, feedback: SkillFeedback): Promise<void>;

  // 技能渐进式披露
  getSkillLevel(skillId: string, level: 0 | 1 | 2): string;

  // 技能使用统计
  getSkillStats(skillId: string): SkillStats;
}
```

### 5.4 GEPA 自我进化引擎（简化版）

```typescript
export interface GEPACycle {
  // 行为记录
  recordAction(action: AgentAction): void;

  // 效果评估
  evaluateOutcome(actionId: string, outcome: ActionOutcome): void;

  // 策略优化（自动优化 prompt）
  async optimizeStrategy(skillId: string): Promise<StrategyUpdate>;

  // 技能沉淀
  async persistLearning(): Promise<void>;

  // 统计信息
  getStats(): GEPAStats;
}

// GEPA 与传统 RL 对比
// | 指标 | 传统 RL | GEPA |
// |------|---------|------|
// | 收敛所需评估次数 | 10,000+ | 100-500 |
// | 优化方式 | 梯度下降 | 类反向传播 |
// | 适用场景 | 大规模训练 | 单用户持续学习 |
```

### 5.5 定期推动机制 (Periodic Nudge)

```typescript
export interface MemoryNudge {
  interval: number;           // 检查间隔（分钟），默认 30
  threshold: number;          // 重要性阈值 (0-1)，默认 0.7
  maxItemsPerNudge: number;   // 每次推动最多处理条目数，默认 5
}

export interface NudgeAction {
  type: "persist" | "discard" | "summarize";
  item: MemoryItem;
  reason: string;
  confidence: number;         // 置信度
}

// 推动机制工作流程
// 1. 定期检查短期记忆中的条目
// 2. 评估每个条目的重要性（基于使用频率、用户反馈、任务复杂度）
// 3. 高重要性 → 持久化到长期记忆
// 4. 中等重要性 → 摘要后存储
// 5. 低重要性 → 丢弃
```

### 5.6 子代理并行执行

```typescript
export interface AgentDelegate {
  // 生成隔离子代理
  spawnSubAgent(task: SubTask): Promise<SubAgentHandle>;

  // RPC 风格工具调用
  callTool(agentId: string, tool: string, input: unknown): Promise<unknown>;

  // 结果合并
  mergeResults(results: SubAgentResult[]): MergedResult;

  // 状态管理
  getAgentStatus(agentId: string): AgentStatus;
  killAgent(agentId: string): Promise<void>;
  listAgents(): SubAgentHandle[];
}

// 子代理特性
// - 彼此隔离，一个失败不影响其他
// - 获得 RPC 风格的工具调用能力
// - 将多步骤程序压缩为单次回合
// - 支持并行处理复杂工作流
```

---

## 六、插件目录结构

### 6.1 完整目录树

```
.openflow/
├── plugins/                    # 用户插件目录
│   ├── skills/                 # 技能插件
│   │   ├── code-review/
│   │   │   ├── plugin.json     # 能力清单
│   │   │   ├── SKILL.md        # 技能描述 (agentskills.io 标准)
│   │   │   ├── index.ts        # 激活逻辑
│   │   │   └── references/     # 参考材料 (Level 2)
│   │   │       └── style-guide.md
│   │   └── data-analysis/
│   │       ├── plugin.json
│   │       ├── SKILL.md
│   │       └── scripts/
│   │           └── analyze.py
│   ├── tools/                  # 工具插件
│   │   ├── notion-api/
│   │   │   ├── plugin.json
│   │   │   └── index.ts
│   │   └── figma-export/
│   │       ├── plugin.json
│   │       └── index.ts
│   ├── commands/               # 命令插件
│   │   ├── deploy/
│   │   │   ├── plugin.json
│   │   │   └── index.ts
│   │   └── docker/
│   │       ├── plugin.json
│   │       └── index.ts
│   └── agents/                 # Agent 插件
│       ├── researcher/
│       │   ├── plugin.json
│       │   ├── AGENT.md        # Agent 人格定义
│       │   └── index.ts
│       └── reviewer/
│           ├── plugin.json
│           ├── AGENT.md
│           └── index.ts
├── memory/                     # 记忆存储 (HermesAgent 风格)
│   ├── MEMORY.md               # 环境事实和经验教训
│   ├── USER.md                 # 用户偏好和习惯
│   ├── skills/                 # 自动学习的技能
│   │   ├── pr-review-skill.md
│   │   └── deploy-pipeline-skill.md
│   └── vector-store/           # 向量索引
│       └── index.bin
├── agents/                     # Agent 定义
│   └── hello-agent.md
├── config.yaml                 # 全局配置
└── state.json                  # 运行时状态
```

### 6.2 插件清单格式

```json
{
  "name": "code-review",
  "version": "1.0.0",
  "type": "skill",
  "description": "智能代码审查技能，支持多语言",
  "author": "your-name",
  "license": "MIT",
  "triggers": ["review", "code review", "审查", "pr review"],
  "allowedTools": ["read_file", "grep_code", "lsp_diagnostics", "run_command"],
  "requiredPermissions": ["read_workspace"],
  "dependencies": [],
  "tags": ["coding", "quality", "review"],
  "main": "index.ts"
}
```

### 6.3 全局配置格式

```yaml
# .openflow/config.yaml

# LLM 配置
llm:
  provider: anthropic
  model: claude-sonnet-4-20250514
  maxTokens: 8192
  maxTurns: 100
  tokenBudget: 200000

# 权限配置
permissions:
  mode: askUser
  alwaysAllow:
    - read_file
    - grep_code
    - git_status
  alwaysDeny:
    - rm -rf /
  workspaceBoundaries:
    - pathPattern: "^\\.git/"
      action: deny

# 沙箱配置
sandbox:
  enabled: true
  backend: auto  # auto | bubblewrap | sandbox-exec | none
  readOnlyFs: true
  noNewPrivs: true

# 记忆配置 (HermesAgent 风格)
memory:
  nudge:
    interval: 30       # 分钟
    threshold: 0.7
  skillLearning:
    enabled: true
    autoDistill: true
    minToolCalls: 5    # 最少工具调用次数才触发技能学习

# 插件配置
plugins:
  sources:
    - type: filesystem
      path: .openflow/plugins
  autoEnable: true
  watchChanges: true

# 遥测配置
telemetry:
  enabled: true
  anonymous: true
```

---

## 七、重构实施路径

### Phase 1: 核心基础设施（第 1-2 周）

| 序号 | 任务 | 产出文件 | 验收标准 |
|------|------|----------|----------|
| 1.1 | 定义 `CapabilityPlugin` 统一接口 | `core/types/capability.ts` | 类型定义完整，无编译错误 |
| 1.2 | 实现 `CapabilityManager` | `core/capability-manager.ts` | 支持 register/enable/disable/hotReload |
| 1.3 | 实现 `PluginDiscovery` | `core/plugin-discovery.ts` | 支持 filesystem/npm/builtin 来源 |
| 1.4 | 实现 `ContextFactory` | `core/context-factory.ts` | 正确注入所有核心服务 |
| 1.5 | 重构现有 Skill 为插件协议 | `core/adapters/skill-adapter.ts` | 向后兼容，现有 skill 正常工作 |
| 1.6 | 重构现有 Tool 为插件协议 | `core/adapters/tool-adapter.ts` | 向后兼容，现有 tool 正常工作 |
| 1.7 | 重构现有 Command 为插件协议 | `core/adapters/command-adapter.ts` | 向后兼容，现有 command 正常工作 |

### Phase 2: 编程能力内置化（第 3 周）

| 序号 | 任务 | 产出文件 | 验收标准 |
|------|------|----------|----------|
| 2.1 | 提取编程工具到 `core/coding-tools/` | 5 个工具文件 | 所有编程工具可正常调用 |
| 2.2 | 精简 Memory 为三层架构 | `core/memory/` | 三层记忆正常工作 |
| 2.3 | 实现安全权限管道 | `core/security/` | 权限审批流程正常 |
| 2.4 | 更新 `backend/index.ts` 导出 | `backend/index.ts` | 所有新模块正确导出 |
| 2.5 | 更新 `main.tsx` 集成 | `backend/main.tsx` | 启动时正确加载能力 |

### Phase 3: HermesAgent 特性集成（第 4-5 周）

| 序号 | 任务 | 产出文件 | 验收标准 |
|------|------|----------|----------|
| 3.1 | 实现技能自动学习系统 | `core/skill-learner.ts` | 任务完成后自动创建技能文档 |
| 3.2 | 实现三层记忆架构 | `core/memory/` | 三层记忆独立工作 |
| 3.3 | 实现定期推动机制 | `core/memory/nudge.ts` | 按配置间隔自动评估记忆 |
| 3.4 | 实现子代理并行执行 | `core/agent/delegate.ts` | 子代理可并行工作 |
| 3.5 | 实现 GEPA 简化版 | `core/gepa-engine.ts` | 策略可自动优化 |
| 3.6 | 实现 MEMORY.md / USER.md | `core/memory/persistence.ts` | 跨会话记忆持久化 |

### Phase 4: 插件生态与体验（第 6 周）

| 序号 | 任务 | 产出文件 | 验收标准 |
|------|------|----------|----------|
| 4.1 | 插件管理命令 | `commands/plugin.ts` | `/plugin install/list/enable/disable` |
| 4.2 | 能力管理命令 | `commands/capability.ts` | `/skills/tools/agents` 列出能力 |
| 4.3 | 健康检查与错误恢复 | `core/resilience/` | 异常能力自动隔离 |
| 4.4 | 插件开发指南 | `docs/plugin-dev-guide.md` | 开发者可按指南创建插件 |
| 4.5 | 示例插件 | `.openflow/plugins/skills/example/` | 完整的示例插件 |

---

## 八、关键代码示例

### 8.1 插件激活示例

```typescript
// .openflow/plugins/skills/code-review/index.ts

import type { CapabilityPlugin, CapabilityContext } from "@openflow/core";

export const codeReviewPlugin: CapabilityPlugin = {
  manifest: {
    name: "code-review",
    version: "1.0.0",
    type: "skill",
    description: "智能代码审查技能",
    triggers: ["review", "审查"],
    allowedTools: ["read_file", "grep_code", "lsp_diagnostics"],
  },

  async activate(ctx: CapabilityContext) {
    // 注册审查工具
    ctx.tools.register({
      name: "code_review",
      description: "执行代码审查",
      inputSchema: { filePath: "string" },
      async execute(input: { filePath: string }) {
        const content = await ctx.tools.call("read_file", { path: input.filePath });
        const diagnostics = await ctx.tools.call("lsp_diagnostics", { file: input.filePath });
        return generateReview(content, diagnostics);
      },
    });

    // 返回清理函数
    return {
      dispose: () => ctx.tools.unregister("code_review"),
    };
  },

  async deactivate() {
    // 清理资源
  },

  async healthCheck() {
    return true;
  },
};
```

### 8.2 能力管理器使用示例

```typescript
// 启动时加载所有能力
const manager = new CapabilityManager(context);

// 发现并注册内置编程能力
await manager.registerBuiltinCodingTools();

// 发现用户插件
const discovered = await manager.discover([
  { type: "filesystem", path: ".openflow/plugins" },
  { type: "builtin", packages: ["dream", "compact", "verify"] },
]);

// 启用所有发现的能力
for (const plugin of discovered.plugins) {
  await manager.register(plugin, "discovered");
  await this.enable(plugin.manifest.name);
}

// 运行时热重载
manager.on("plugin:updated", (name) => {
  console.log(`Plugin ${name} hot-reloaded`);
});

// 按触发词查找能力
const skill = manager.findByTrigger("帮我审查代码");
// → 返回 code-review 插件

// 列出所有能力
const allSkills = manager.list(CapabilityType.SKILL);
const allTools = manager.list(CapabilityType.TOOL);

// 健康检查
const health = await manager.healthCheck();
// → Map { "code-review" => true, "data-analysis" => false, ... }
```

### 8.3 技能自动学习示例

```typescript
// 任务完成后，自动提炼技能
const learner = new SkillLearner(memoryCore);

const taskResult = {
  goal: "修复登录页面的 XSS 漏洞",
  steps: [
    { tool: "read_file", input: { path: "src/login.tsx" } },
    { tool: "grep_code", input: { pattern: "dangerouslySetInnerHTML" } },
    { tool: "edit_file", input: { path: "src/login.tsx", changes: [...] } },
    { tool: "run_command", input: { command: "npm test" } },
  ],
  outcome: "success",
};

// 自动创建技能文档
const skill = await learner.distillSkill(taskResult);
// 生成 .openflow/memory/skills/xss-fix-skill.md

// 技能文档内容示例:
// ---
// name: xss-fix
// description: 修复 XSS 漏洞的标准流程
// triggers: ["xss", "安全漏洞", "sanitize"]
// allowedTools: ["read_file", "grep_code", "edit_file"]
// ---
//
// ## Overview
// XSS 漏洞修复的标准流程：1. 定位危险代码 2. 替换为安全写法 3. 运行测试
//
// ## Steps
// 1. 使用 grep_code 搜索 dangerouslySetInnerHTML
// 2. 使用 read_file 查看上下文
// 3. 使用 edit_file 替换为安全写法
// 4. 运行测试验证
```

---

## 九、迁移策略

### 9.1 渐进式迁移

```
现有代码 ──→ 适配器层 ──→ 新插件协议
              │
              └── 保持向后兼容，逐步废弃旧 API
```

### 9.2 兼容性保证

| 现有功能 | 迁移方式 | 时间线 |
|----------|----------|--------|
| `skills/registry.ts` | 适配器包装为 `CapabilityPlugin` | Phase 1 |
| `tools/registry.ts` | 适配器包装为 `CapabilityPlugin` | Phase 1 |
| `commands/registry.ts` | 适配器包装为 `CapabilityPlugin` | Phase 1 |
| `plugins/loader.ts` | 重构为 `PluginDiscovery` | Phase 1 |
| `memory/` | 精简为三层架构，其余迁移到插件 | Phase 2 |
| `agent/coordinator/` | 重构为 Agent 插件 | Phase 3 |

### 9.3 废弃时间线

| API | 废弃版本 | 移除版本 | 替代方案 |
|-----|----------|----------|----------|
| `DefaultSkillRegistry` | v0.2.0 | v0.4.0 | `CapabilityManager` |
| `DefaultToolRegistry` | v0.2.0 | v0.4.0 | `CapabilityManager` |
| `DefaultCommandRegistry` | v0.2.0 | v0.4.0 | `CapabilityManager` |
| `loadPluginFromPath` | v0.2.0 | v0.4.0 | `PluginDiscovery` |

---

## 十、预期收益

### 10.1 性能指标

| 指标 | 当前 | 重构后 | 改善 |
|------|------|--------|------|
| 启动时间 | ~3-5s | ~1s | 60-80% ↓ |
| 内存占用 | ~200MB | ~80MB（基础） | 60% ↓ |
| 首次响应 | ~2s | ~0.5s | 75% ↓ |
| 能力加载 | 全量 | 按需 | 动态 |

### 10.2 功能指标

| 功能 | 当前 | 重构后 |
|------|------|--------|
| 可扩展性 | 硬编码 | 插件协议 |
| 热重载 | 不支持 | 支持 |
| 自我学习 | 无 | Hermes 学习循环 |
| 跨会话记忆 | 有限 | 三层持久化 |
| 技能自动创建 | 无 | 自动提炼 |
| 子代理并行 | 简单 | 隔离并行 |
| 健康检查 | 无 | 自动检测 |

### 10.3 开发体验

| 方面 | 当前 | 重构后 |
|------|------|--------|
| 创建新能力 | 修改源码 + 重新编译 | 创建插件目录 + 热加载 |
| 调试 | 重启应用 | 热重载 |
| 分发 | 无法分发 | 插件市场 |
| 版本管理 | 无 | 语义化版本 |
| 依赖管理 | 手动 | 自动解析 |

---

## 十一、详细模块设计

### 11.1 PluginDiscovery 模块

```typescript
// core/plugin-discovery.ts

export class PluginDiscovery {
  // 从文件系统发现
  async discoverFromFS(path: string): Promise<CapabilityPlugin[]>;

  // 从 NPM 包发现
  async discoverFromNPM(packages: string[]): Promise<CapabilityPlugin[]>;

  // 从内置列表发现
  async discoverBuiltin(): Promise<CapabilityPlugin[]>;

  // 统一发现入口
  async discover(sources: CapabilitySource[]): Promise<DiscoveryResult>;

  // 验证插件
  validatePlugin(plugin: CapabilityPlugin): ValidationResult;

  // 解析依赖
  resolveDependencies(plugins: CapabilityPlugin[]): CapabilityPlugin[];
}
```

### 11.2 ContextFactory 模块

```typescript
// core/context-factory.ts

export function createCapabilityContext(
  services: CoreServices
): CapabilityContext {
  const eventEmitter = new EventEmitter();

  return {
    llm: services.llmClient,
    tools: services.toolRegistry,
    memory: services.memoryCore,
    state: services.stateManager,
    security: services.securityEngine,
    telemetry: services.telemetry,
    workspace: services.workspace,
    emit: (event, payload) => eventEmitter.emit(event, payload),
    on: (event, handler) => eventEmitter.on(event, handler),
    once: (event, handler) => eventEmitter.once(event, handler),
    off: (event, handler) => eventEmitter.off(event, handler),
  };
}
```

### 11.3 适配器模块

```typescript
// core/adapters/skill-adapter.ts

export function adaptSkillToPlugin(skill: Skill): CapabilityPlugin {
  return {
    manifest: {
      name: skill.name,
      version: "1.0.0",
      type: CapabilityType.SKILL,
      description: skill.description,
      triggers: skill.triggers,
      allowedTools: skill.allowedTools,
    },
    async activate(ctx) {
      // 将 skill steps 注册为可执行流程
      ctx.tools.register({
        name: `skill_${skill.name}`,
        description: skill.description,
        inputSchema: {},
        async execute(input) {
          return executeSkillSteps(skill.steps, ctx);
        },
      });
    },
  };
}
```

### 11.4 记忆核心模块

```typescript
// core/memory/core.ts

export class MemoryCore {
  private working: WorkingMemory;
  private procedural: ProceduralMemory;
  private semantic: SemanticMemory;
  private nudge: MemoryNudge;

  // 短期记忆操作
  async setWorking(key: string, value: unknown): Promise<void>;
  async getWorking(key: string): Promise<unknown>;

  // 程序记忆操作
  async storeSkill(skill: SkillDocument): Promise<void>;
  async retrieveSkill(query: string): Promise<SkillDocument[]>;

  // 长期记忆操作
  async persistFact(fact: string): Promise<void>;
  async searchFacts(query: string): Promise<string[]>;

  // 定期推动
  startNudgeCycle(): void;
  stopNudgeCycle(): void;

  // 持久化
  async save(): Promise<void>;
  async load(): Promise<void>;
}
```

### 11.5 安全引擎模块

```typescript
// core/security/engine.ts

export class SecurityEngine {
  private pipeline: PermissionPipeline;
  private sandbox: SandboxAdapter;
  private boundaries: WorkspaceBoundary[];

  async checkPermission(
    permission: string,
    context?: Record<string, unknown>
  ): Promise<boolean> {
    const decision = await this.pipeline.check(permission, context);
    return decision === "allow";
  }

  async sandboxCommand(
    command: string,
    config?: SandboxConfig
  ): Promise<SandboxResult> {
    // 1. 检查工作区边界
    this.checkWorkspaceBoundaries(command);
    // 2. 执行沙箱
    return this.sandbox.execute(command, config || getDefaultSandboxConfig());
  }

  private checkWorkspaceBoundaries(command: string): void {
    for (const boundary of this.boundaries) {
      if (boundary.action === "deny" && boundary.pathPattern.test(command)) {
        throw new SecurityError(`Blocked by workspace boundary: ${boundary.reason}`);
      }
    }
  }
}
```

---

## 十二、类型定义完整清单

### 12.1 核心类型 (`core/types/capability.ts`)

| 类型 | 用途 |
|------|------|
| `CapabilityType` | 能力类型枚举 |
| `CapabilityStatus` | 能力状态枚举 |
| `CapabilityManifest` | 能力清单 |
| `CapabilityPlugin<T>` | 能力插件接口 |
| `CapabilityContext` | 能力上下文 |
| `CapabilityInfo` | 能力信息（用于列表展示） |
| `CapabilitySource` | 能力来源 |
| `DiscoveryResult` | 发现结果 |
| `DiscoveryError` | 发现错误 |
| `CapabilityLifecycle` | 生命周期钩子 |
| `CapabilityEventMap` | 事件映射 |

### 12.2 服务接口

| 接口 | 用途 |
|------|------|
| `LLMClient` | LLM 客户端抽象 |
| `ToolRegistry` | 工具注册表 |
| `ToolDefinition` | 工具定义 |
| `MemoryCore` | 记忆核心 |
| `StateManager` | 状态管理 |
| `SecurityEngine` | 安全引擎 |
| `TelemetryService` | 遥测服务 |
| `WorkspaceContext` | 工作区上下文 |

### 12.3 HermesAgent 相关类型

| 类型 | 用途 |
|------|------|
| `SkillDocument` | 技能文档 (agentskills.io) |
| `SkillLearner` | 技能学习器 |
| `GEPACycle` | GEPA 进化循环 |
| `MemoryNudge` | 记忆推动配置 |
| `NudgeAction` | 推动动作 |
| `AgentDelegate` | Agent 委托器 |
| `SubAgentHandle` | 子代理句柄 |
| `SubAgentResult` | 子代理结果 |

---

## 附录

### A. 与 HermesAgent 的对比

| 特性 | HermesAgent | OpenFlow CLI (重构后) |
|------|-------------|----------------------|
| 自我学习 | GEPA 引擎 | GEPA 简化版 |
| 记忆架构 | 三层 | 三层 |
| 技能标准 | agentskills.io | agentskills.io 兼容 |
| 编程能力 | 通用 | 顶级编程专用 |
| 插件系统 | 有限 | 统一可拔插协议 |
| 安全 | Docker 沙箱 | 多平台沙箱 + 权限管道 |
| 部署 | 6 种后端 | CLI + TUI |
| 定位 | 通用数字员工 | 顶级编程个人助手 |

### B. 参考项目

- **HermesAgent**: Nous Research 的自我进化 AI 智能体框架
- **agentskills.io**: 开放技能标准
- **GEPA**: UC Berkeley/Stanford/MIT 联合开发的策略优化系统
- **Claude Code**: Anthropic 的编程助手架构参考

### C. 术语表

| 术语 | 定义 |
|------|------|
| Capability | 能力，系统提供的功能单元 |
| Plugin | 插件，能力的实现载体 |
| Skill | 技能，复杂任务的可复用流程 |
| Tool | 工具，原子操作 |
| Command | 命令，用户触发的斜杠命令 |
| Agent | 自主决策体 |
| Nudge | 推动，定期评估记忆的机制 |
| GEPA | 通用策略进化算法 |
| FTS5 | SQLite 全文搜索引擎 |
