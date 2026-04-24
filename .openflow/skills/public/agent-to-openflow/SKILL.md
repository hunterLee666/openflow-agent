---
name: ai-agent-platform
description: "通过 AI 代理平台的 HTTP API 进行交互。当用户想要向 AI 代理平台发送消息或问题进行研究/分析、启动对话线程、检查平台状态或健康状况、列出平台中可用的模型/技能/代理、管理平台内存、上传文件到线程，或将复杂的研究任务委托给 AI 代理时使用此技能。当用户提及 AI 代理、深度研究代理，或想要运行 AI 代理平台可以处理的深度研究任务时也使用。"
---

# AI 代理平台技能

通过 HTTP API 与运行的 AI 代理平台实例通信。AI 代理平台是一个基于 LangGraph 构建的 AI 代理系统，协调子代理进行研究、代码执行、网络浏览等。

## 架构

AI 代理平台在反向代理后面暴露两个 API 表面：

| 服务 | 直接端口 | 通过代理 | 用途 |
|----------------|-------------|----------------------------------|----------------------------------|
| Gateway API | 8001 | `$AGENT_GATEWAY_URL` | REST 端点（模型、技能、内存、上传） |
| LangGraph API | 2024 | `$AGENT_LANGGRAPH_URL` | 代理线程、运行、流式处理 |

## 环境变量

所有 URL 都可通过环境变量配置。**在任何请求之前阅读这些环境变量。**

| 变量 | 默认值 | 描述 |
|-------------------------|------------------------------------------|------------------------------------|
| `AGENT_URL` | `http://localhost:2026` | 统一代理基础 URL |
| `AGENT_GATEWAY_URL` | `${AGENT_URL}` | Gateway API 基础（模型、技能、内存、上传） |
| `AGENT_LANGGRAPH_URL` | `${AGENT_URL}/api/langgraph` | LangGraph API 基础（线程、运行） |

发出 curl 调用时，始终像这样解析 URL：

```bash
# 从环境变量解析基础 URL（在任何 API 调用之前先执行此操作）
AGENT_URL="${AGENT_URL:-http://localhost:2026}"
AGENT_GATEWAY_URL="${AGENT_GATEWAY_URL:-$AGENT_URL}"
AGENT_LANGGRAPH_URL="${AGENT_LANGGRAPH_URL:-$AGENT_URL/api/langgraph}"
```

## 可用操作

### 1. 健康检查

验证 AI 代理平台正在运行：

```bash
curl -s "$AGENT_GATEWAY_URL/health"
```

### 2. 发送消息（流式）

这是主要操作。它创建一个线程并流式传输代理的响应。

**步骤1：创建线程**

```bash
curl -s -X POST "$AGENT_LANGGRAPH_URL/threads" \
  -H "Content-Type: application/json" \
  -d '{}'
```

响应：`{"thread_id": "<uuid>", ...}`

**步骤2：流式传输运行**

```bash
curl -s -N -X POST "$AGENT_LANGGRAPH_URL/threads/<thread_id>/runs/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "lead_agent",
    "input": {
      "messages": [
        {
          "type": "human",
          "content": [{"type": "text", "text": "YOUR MESSAGE HERE"}]
        }
      ]
    },
    "stream_mode": ["values", "messages-tuple"],
    "stream_subgraphs": true,
    "config": {
      "recursion_limit": 1000
    },
    "context": {
      "thinking_enabled": true,
      "is_plan_mode": true,
      "subagent_enabled": true,
      "thread_id": "<thread_id>"
    }
  }'
```

响应是 SSE 流。每个事件的格式为：
```
event: <event_type>
data: <json_data>
```

关键事件类型：
- `metadata` — 运行元数据，包括 `run_id`
- `values` — 包含 `messages` 数组的完整状态快照
- `messages-tuple` — 增量消息更新（AI 文本块、工具调用、工具结果）
- `end` — 流完成

**上下文模式**（通过 `context` 设置）：
- Flash 模式：`thinking_enabled: false, is_plan_mode: false, subagent_enabled: false`
- 标准模式：`thinking_enabled: true, is_plan_mode: false, subagent_enabled: false`
- Pro 模式：`thinking_enabled: true, is_plan_mode: true, subagent_enabled: false`
- Ultra 模式：`thinking_enabled: true, is_plan_mode: true, subagent_enabled: true`

### 3. 继续对话

要发送后续消息，重用步骤2中的相同 `thread_id` 并用新消息发布另一个运行。

### 4. 列出模型

```bash
curl -s "$AGENT_GATEWAY_URL/api/models"
```

返回：`{"models": [{"name": "...", "provider": "...", ...}, ...]}`

### 5. 列出技能

```bash
curl -s "$AGENT_GATEWAY_URL/api/skills"
```

返回：`{"skills": [{"name": "...", "enabled": true, ...}, ...]}`

### 6. 启用/禁用技能

```bash
curl -s -X PUT "$AGENT_GATEWAY_URL/api/skills/<skill_name>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### 7. 列出代理

```bash
curl -s "$AGENT_GATEWAY_URL/api/agents"
```

返回：`{"agents": [{"name": "...", ...}, ...]}`

### 8. 获取内存

```bash
curl -s "$AGENT_GATEWAY_URL/api/memory"
```

返回用户上下文、事实和对话历史摘要。

### 9. 上传文件到线程

```bash
curl -s -X POST "$AGENT_GATEWAY_URL/api/threads/<thread_id>/uploads" \
  -F "files=@/path/to/file.pdf"
```

支持 PDF、PPTX、XLSX、DOCX — 自动转换为 Markdown。

### 10. 列出已上传文件

```bash
curl -s "$AGENT_GATEWAY_URL/api/threads/<thread_id>/uploads/list"
```

### 11. 获取线程历史

```bash
curl -s "$AGENT_LANGGRAPH_URL/threads/<thread_id>/history"
```

### 12. 列出线程

```bash
curl -s -X POST "$AGENT_LANGGRAPH_URL/threads/search" \
  -H "Content-Type: application/json" \
  -d '{"limit": 20, "sort_by": "updated_at", "sort_order": "desc"}'
```

## 使用脚本

对于发送消息和收集完整响应，请使用辅助脚本：

```bash
bash /path/to/skills/ai-agent-platform/scripts/chat.sh "Your question here"
```

参见 `scripts/chat.sh` 的实现。该脚本：
1. 检查健康状况
2. 创建线程
3. 流式传输运行并收集最终的 AI 响应
4. 打印结果

## 解析 SSE 输出

流返回 SSE 事件。要从 `values` 事件中提取最终的 AI 响应：
- 查找最后一个 `event: values` 块
- 解析其 `data` JSON
- `messages` 数组包含所有消息；最后一个 `type: "ai"` 的消息是响应
- 该消息的 `content` 字段是 AI 的文本回复

## 错误处理

- 如果健康检查失败，AI 代理平台未运行。通知用户需要启动它。
- 如果流返回错误事件，提取并显示错误消息。
- 常见问题：端口未打开、服务仍在启动、配置错误。

## 提示

- 对于快速问题，使用 flash 模式（最快，无规划）。
- 对于研究任务，使用 pro 或 ultra 模式（启用规划和子代理）。
- 你可以先上传文件，然后在消息中引用它们。
- 线程 ID 持久化 — 你可以稍后返回对话。
