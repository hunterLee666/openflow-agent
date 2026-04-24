---
name: find-skills
description: 当用户询问"如何做X"、"找一个X的技能"、"有能...的技能吗"，或表示有兴趣扩展能力时，帮助用户发现和安装技能。当用户正在寻找可能作为可安装技能存在的功能时，应使用此技能。
---

# 查找技能

此技能帮助你从开放的代理技能生态系统中发现和安装技能。

## 何时使用此技能

当用户有以下情况时使用此技能：

- 询问"如何做X"，其中X可能是现有技能的常见任务
- 说"找一个X的技能"或"有X的技能吗"
- 询问"你能做X吗"，其中X是一种专业能力
- 表示有兴趣扩展代理能力
- 想要搜索工具、模板或工作流程
- 提到他们希望有特定领域的帮助（设计、测试、部署等）

## Skills CLI 是什么？

Skills CLI（`npx skills`）是开放代理技能生态系统的包管理器。技能是模块化包，通过专业知识和工作流程扩展代理能力。

**关键命令：**

- `npx skills find [query]` - 交互式搜索或按关键词搜索技能
- `npx skills check` - 检查技能更新
- `npx skills update` - 更新所有已安装的技能

**浏览技能：** https://skills.sh/

## 如何帮助用户找到技能

### 步骤1：了解他们的需求

当用户请求帮助时，识别：

1. 领域（例如 React、测试、设计、部署）
2. 具体任务（例如编写测试、创建动画、审查 PR）
3. 这是否是足够常见的任务，可能存在技能

### 步骤2：搜索技能

使用相关查询运行查找命令：

```bash
npx skills find [query]
```

例如：

- 用户问"如何让我的 React 应用更快？" → `npx skills find react performance`
- 用户问"你能帮我审查 PR 吗？" → `npx skills find pr review`
- 用户问"我需要创建一个变更日志" → `npx skills find changelog`

命令将返回类似以下结果：

```
Install with bash /path/to/skill/scripts/install-skill.sh vercel-labs/agent-skills@vercel-react-best-practices

vercel-labs/agent-skills@vercel-react-best-practices
└ https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

### 步骤3：向用户展示选项

当你找到相关技能时，向用户展示：

1. 技能名称及其功能
2. 他们可以运行的安装命令
3. 了解更多信息的 skills.sh 链接

示例响应：

```
我找到了一个可能有帮助的技能！"vercel-react-best-practices"技能提供来自 Vercel Engineering 的 React 和 Next.js 性能优化指南。

安装方法：
bash /path/to/skill/scripts/install-skill.sh vercel-labs/agent-skills@vercel-react-best-practices

了解更多：https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

### 步骤4：安装技能

如果用户想要继续，使用 `install-skill.sh` 脚本安装技能并自动链接到项目：

```bash
bash /path/to/skill/scripts/install-skill.sh <owner/repo@skill-name>
```

例如，如果用户想要安装 `vercel-react-best-practices`：

```bash
bash /path/to/skill/scripts/install-skill.sh vercel-labs/agent-skills@vercel-react-best-practices
```

脚本将全局安装技能到 `skills/custom/`

## 常见技能类别

搜索时，考虑这些常见类别：

| 类别 | 示例查询 |
| --------------- | ---------------------------------------- |
| Web 开发 | react, nextjs, typescript, css, tailwind |
| 测试 | testing, jest, playwright, e2e |
| DevOps | deploy, docker, kubernetes, ci-cd |
| 文档 | docs, readme, changelog, api-docs |
| 代码质量 | review, lint, refactor, best-practices |
| 设计 | ui, ux, design-system, accessibility |
| 效率 | workflow, automation, git |

## 有效搜索的提示

1. **使用具体关键词**："react testing" 比仅"testing"更好
2. **尝试替代术语**：如果"deploy"不起作用，尝试"deployment"或"ci-cd"
3. **检查流行来源**：许多技能来自 `vercel-labs/agent-skills` 或 `ComposioHQ/awesome-claude-skills`

## 未找到技能时

如果没有找到相关技能：

1. 确认未找到现有技能
2. 提供直接使用你的通用能力帮助完成任务的选项
3. 建议用户可以使用 `npx skills init` 创建自己的技能

示例：

```
我搜索了与"xyz"相关的技能，但没有找到匹配项。
我仍然可以直接帮助你完成这个任务！你想继续吗？

如果这是你经常做的事情，你可以创建自己的技能：
npx skills init my-xyz-skill
```
