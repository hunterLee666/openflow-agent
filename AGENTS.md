# AGENTS.md

此文件为 opencode 在此仓库中处理代码时提供指导。

## 项目概述

- **类型**: AI 终端助手 (TUI 应用)
- **核心框架**: Ink (React-based Terminal UI)
- **运行时**: Bun (开发和生产)
- **语言**: TypeScript (严格模式)

## 常用命令

### 构建

```bash
bun run build     # 构建项目 (TypeScript 编译 + 资源复制)
bun run clean     # 清理 dist 目录
```

构建产物输出到 `dist/` 目录。

### 开发

```bash
bun run dev       # 直接从 TypeScript 源代码运行 CLI
```

直接运行 `src/entrypoints/cli.tsx`，对源码的更改会立即反映。

### 代码检查和格式化

```bash
bun run format        # Prettier 格式化
bun run format:check  # 检查格式
bun run lint          # ESLint 检查
bun run lint:fix      # 自动修复
bun run typecheck     # TypeScript 类型检查
```

### 测试

```bash
bun test             # 运行所有测试
bun test tests/unit  # 单元测试
```

### 其他脚本

```bash
bun run build:npm         # 构建发布版本
bun run prepublishOnly    # 发布前检查
```

## 代码约定

- **模块系统**: ESM (`"type": "module"`)
- **TypeScript**: 严格模式 (`noImplicitAny`, `strictNullChecks`, `noUnusedLocars`, `verbatimModuleSyntax`)
- **格式化**: Prettier — 单引号、分号、尾随逗号、2-空格缩进、80-字符宽度
- **代码检查**: 无 `any` 类型、一致的类型导入、无包间相对导入
- **提交**: 约定式提交 (例如 `feat(cli): Add --json flag`)
- **Node.js**: >= 20.18.1

## 项目结构

```
src/
├── acp/              # ACP (Agent Communication Protocol) 实现
├── app/              # 应用主入口
├── assistant/        # Assistant 功能 (AutoDream 等)
├── commands/         # CLI 命令
├── components/       # React 组件
├── constants/        # 常量定义
├── context/          # 上下文管理
├── core/             # 核心配置和工具
│   ├── config/       # 配置管理
│   └── tools/        # 核心工具
├── engine/           # Agent 引擎
├── entrypoints/      # CLI 入口点
│   ├── cli.tsx       # 主 CLI 入口 (Ink TUI)
│   ├── cli/          # CLI 模式实现
│   │   ├── interactive.ts  # 交互模式
│   │   ├── newCli.ts       # 新版 CLI
│   │   ├── simple.ts       # 简单模式
│   │   └── runCli.tsx      # TUI 主界面
│   └── stdio/        # STDIO 模式
├── screens/          # TUI 屏幕
├── services/         # 业务服务
│   ├── ai/           # AI/LLM 相关
│   ├── mcp/          # MCP 协议
│   ├── plugins/      # 插件系统
│   └── ...
├── tools/            # 工具实现
├── types/            # 类型定义
├── ui/               # UI 组件和 hooks
└── utils/           # 工具函数

openflow-agent-sdk/  # SDK 子包
scripts/             # 构建脚本
```

### 关键入口点

- `cli.js` — 主 CLI 入口 (生产构建)
- `cli.tsx` — 主 CLI 入口 (开发)
- `cli-acp.js` — ACP 模式入口

## 开发指南

### 通用工作流程

1. **非平凡工作的设计文档** — 如果更改涉及多个文件或设计决策，在 `.opencode/design/` 中编写一个
2. **行为更改的测试计划** — 当更改影响用户可观察行为时，在 `.opencode/e2e-tests/` 中编写 E2E 测试计划
3. **在声明完成之前构建 + 类型检查**: `bun run build && bun run typecheck`
4. **代码审查** — 对每个评论进行分类：有效 / 误报 / 过度思考

### 功能开发

使用 `/feat-dev` 技能进行完整工作流程：调查、设计、测试计划、干运行、实施、验证、代码审查和迭代。

### 错误修复

使用 `/bugfix` 技能进行先重现的工作流程：重现、修复、验证、测试和代码审查。

## GitHub 操作

对所有 GitHub 相关操作使用 `gh` CLI — 问题、拉取请求、评论、CI 检查、发布和 API 调用。优先使用 `gh issue view`、`gh pr view`、`gh pr checks`、`gh run view`、`gh api` 等。

## 测试、调试和错误修复

- **错误重现和验证**: 生成 `test-engineer` 代理。它阅读代码和文档以理解错误，然后通过 E2E 测试重现（或测试脚本回退）。
- **困难错误**: 当调试需要超过快速查看时使用 `structured-debugging` 技能 — 尤其是当第一次修复尝试失败或行为似乎不可能时。
- **E2E 测试**: `e2e-testing` 技能涵盖无头模式、交互式（tmux）模式、MCP 服务器测试和 API 流量检查。

## 提交 PR

创建 PR 时，请遵循 `.github/pull_request_template.md` 中的模板。提交 PR 后，如果适用，请在单独评论中发布 E2E 测试报告。

- **PR 描述**: 用散文解释动机和更改。避免引用文件名或函数名。
- **审查者测试计划**: 描述审查者应验证的行为和预期结果，而不是脚本化测试命令。

## 项目目录

项目工件位于 `.openflow-arti/` 下：

| 目录                    | 目的                              |
| --------------------- | --------------------------------- |
| `.openflow-arti/design/`       | 计划功能的设计文档               |
| `.openflow-arti/e2e-tests/`    | E2E 测试计划和结果               |
| `.openflow-arti/issues/`       | 在 GitHub 上提交前的议题草稿     |
| `.openflow-arti/pr-drafts/`    | 提交前的 PR 草稿                 |
| `.openflow-arti/pr-reviews/`   | PR 审查笔记                      |
| `.openflow-arti/investigations/` | 结构化调试日志                  |
| `.openflow-arti/scripts/`      | 实用脚本                          |

## 环境配置

- `.env.example` — 环境变量示例
- `.openflow.json` — 项目配置文件
- `yoga.wasm` — 布局引擎 (Ink 依赖)