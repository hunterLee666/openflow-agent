# OpenFlow 前后端分离架构

## 架构说明

系统已改造为前后端分离架构：

- **后端服务** (`backend/main.tsx`): 运行 OpenFlow Core + BridgeMain，提供 WebSocket 服务
- **前端客户端** (`frontend/tui/client-app.tsx`): 通过 BridgeClient 连接后端，提供 TUI 界面

## 运行方式

### 方式一：一键启动（推荐）

```bash
bun run all -k your-api-key

# 或开发模式（热重载）
bun run all:dev -k your-api-key
```

这会自动启动后端服务，等待后端就绪后再启动前端客户端。

### 方式二：分别启动

**1. 启动后端服务：**

```bash
bun run server -k your-api-key
# 或开发模式（热重载）
bun run server:dev -k your-api-key
```

**2. 启动前端客户端：**

打开新终端，运行：

```bash
bun run client
# 或开发模式（热重载）
bun run client:dev
```

### 方式二：使用环境变量

```bash
# 启动后端
OPENAI_API_KEY=your-key bun run server --port 8765

# 启动客户端
OPENFLOW_WS_URL=ws://localhost:8765 bun run client
```

## 命令行参数

### 后端服务参数

```
-w, --workspace <path>    工作目录 (默认: 当前目录)
-k, --api-key <key>       API 密钥
-m, --model <model>       模型名称 (默认: gpt-4)
-p, --provider <provider> 提供商名称 (默认: openai)
-b, --base-url <url>      基础 URL
--port <port>             WebSocket 端口 (默认: 8765)
```

### 前端客户端参数

```
-w, --workspace <path>    工作目录 (默认: 当前目录)
-u, --ws-url <url>        WebSocket 服务器地址 (默认: ws://localhost:8765)
```

## 通信流程

```
前端 TUI (client-app.tsx)
    ↓ BridgeClient.call("query", {message})
    ↓ WebSocket (ws://localhost:8765)
后端 BridgeMain (main.tsx)
    ↓ OpenFlowCore.executeQuery()
    ↓ LLM 处理 + 工具调用
    ↓ 返回结果
前端 TUI 显示结果
```

## 快速测试

```bash
# 终端 1: 启动后端
bun run server -k your-api-key

# 终端 2: 启动客户端
bun run client
```
