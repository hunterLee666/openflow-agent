import { OpenFlowCore } from "./openflow-core.js";
import type { OpenFlowConfig } from "./openflow-core.js";
import { BridgeMain } from "./bridge/bridge-main.js";
import type { BridgeDependencies } from "./bridge/bridge-main.js";
import { signJwt } from "./bridge/jwt-auth.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";

async function main() {
  const args = process.argv.slice(2);
  const config: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--workspace":
      case "-w":
        config.workspaceRoot = args[++i];
        break;
      case "--api-key":
      case "-k":
        config.apiKey = args[++i];
        break;
      case "--model":
      case "-m":
        config.model = args[++i];
        break;
      case "--provider":
      case "-p":
        config.provider = args[++i];
        break;
      case "--base-url":
      case "-b":
        config.baseUrl = args[++i];
        break;
      case "--port":
        config.port = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(`
OpenFlow Server - AI 编码助手服务端

用法:
  openflow-server [选项]

选项:
  -w, --workspace <path>    工作目录 (默认: 当前目录)
  -k, --api-key <key>       API 密钥
  -m, --model <model>       模型名称 (默认: gpt-4)
  -p, --provider <provider> 提供商名称 (默认: openai)
  -b, --base-url <url>      基础 URL
  --port <port>             WebSocket 端口 (默认: 8765)
  -h, --help                显示帮助信息
        `);
        process.exit(0);
        break;
    }
  }

  const workspaceRoot = config.workspaceRoot || process.cwd();
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  const model = config.model || process.env.OPENFLOW_MODEL || "gpt-4";
  const provider = config.provider || process.env.OPENFLOW_PROVIDER || "openai";
  const baseUrl = config.baseUrl || process.env.OPENFLOW_BASE_URL;
  const port = parseInt(config.port || "8765", 10);

  if (!apiKey) {
    console.error("错误: 未设置 API 密钥。请使用 --api-key 参数或设置 OPENAI_API_KEY / ANTHROPIC_API_KEY 环境变量");
    process.exit(1);
  }

  console.log("🚀 正在启动 OpenFlow Server...");
  console.log(`📁 工作目录: ${workspaceRoot}`);
  console.log(`🤖 模型: ${model} (${provider})`);

  const memoryDir = join(homedir(), ".openflow", "memory");
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }

  const sessionsDir = join(homedir(), ".openflow", "sessions");
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }

  const openflowConfig: OpenFlowConfig = {
    workspaceRoot,
    memoryDir,
    pluginSources: [],
    sessionId: `session_${Date.now()}`,
    llmConfig: {
      apiKey,
      model,
      provider,
      baseUrl,
      maxTokens: 4096,
      temperature: 0.7,
    },
    sessionConfig: {
      sessionsDir,
    },
    queryConfig: {
      maxTokens: 8192,
      maxTurns: 50,
      tokenBudget: 100000,
    },
    telemetryConfig: {
      logLevel: "info",
      enableMetrics: true,
      enableHealthCheck: true,
    },
  };

  const core = new OpenFlowCore(
    {
      workspace: {
        rootPath: workspaceRoot,
        isPathAllowed: () => true,
        readFile: async () => "",
        writeFile: async () => {},
        listDirectory: async () => [],
      },
      emit: () => {},
      on: () => {},
      once: () => {},
      off: () => {},
    } as any,
    openflowConfig
  );

  await core.initialize();
  console.log("✅ OpenFlow Core 初始化完成");

  const jwtSecret = crypto.randomUUID();

  const bridgeDeps: BridgeDependencies = {
    jwtSecret,
    jwtOptions: {
      audience: "openflow-bridge",
      algorithms: ["HS256"],
      clockTolerance: 60,
    },
    sessionRunnerConfig: {
      maxSessions: 100,
      idleTtlMs: 30 * 60 * 1000,
      sweepIntervalMs: 60 * 1000,
      maxConcurrentPerSession: 1,
    },
    handlers: new Map(),
    transportConfig: {
      type: "websocket",
      port,
      host: "localhost",
    },
  };

  const bridge = new BridgeMain({
    dependencies: bridgeDeps,
    enableDebugLogging: true,
  });

  bridge.registerHandler("query", async (params: unknown, sessionId: string) => {
    const { message, model } = params as { message: string; model?: string };

    if (!message) {
      throw new Error("消息内容不能为空");
    }

    console.log(`[Session ${sessionId}] 收到查询: ${message}${model ? ` (model: ${model})` : ''}`);

    const queryOptions: any = { message, threadId: sessionId };
    if (model) {
      queryOptions.model = model;
    }

    const result = await core.executeQuery(queryOptions);

    console.log(`[Session ${sessionId}] 查询完成`);

    return {
      content: result.content,
      threadId: result.threadId,
      turn: result.turn,
      usage: result.usage,
    };
  });

  bridge.registerHandler("streamQuery", async (params: unknown, sessionId: string) => {
    const { message, model } = params as { message: string; model?: string };

    if (!message) {
      throw new Error("消息内容不能为空");
    }

    console.log(`[Session ${sessionId}] streamQuery 开始处理: ${message.substring(0, 50)}...`);

    const chunks: string[] = [];
    let contentLength = 0;
    let eventCount = 0;

    const queryOptions: any = { message, threadId: sessionId };
    if (model) {
      queryOptions.model = model;
    }

    try {
      console.log(`[Session ${sessionId}] 调用 core.executeQuery...`);
      const result = await core.executeQuery(
        queryOptions,
        async (event) => {
          eventCount++;
          console.log(`[Session ${sessionId}] 收到事件 ${eventCount}: ${event.kind}`);
          if (event.kind === "assistant_text_delta" || event.kind === "completion") {
            const text = event.text || "";
            chunks.push(text);
            contentLength += text.length;
            console.log(`[Session ${sessionId}] 发送 stream_chunk: ${text.substring(0, 20)}...`);

            await bridge.sendNotification("stream_chunk", {
              chunk: text,
              contentLength,
              isFirst: chunks.length === 1,
            }, sessionId);
          } else if (event.kind === "tool_call") {
            await bridge.sendNotification("tool_call", {
              toolCall: event.toolCall,
            }, sessionId);
          } else if (event.kind === "tool_result") {
            await bridge.sendNotification("tool_result", {
              toolName: event.toolName,
              result: event.result,
            }, sessionId);
          }
        }
      );

      console.log(`[Session ${sessionId}] streamQuery 完成，共 ${eventCount} 个事件, ${chunks.length} 个 chunks`);

      return {
        content: chunks.join("") || result.content,
        threadId: result.threadId,
        turn: result.turn,
        usage: result.usage,
      };
    } catch (error) {
      console.error(`[Session ${sessionId}] streamQuery 错误:`, error);
      throw error;
    }
  });

  bridge.registerHandler("listSessions", async (_params: unknown, sessionId: string) => {
    console.log(`[Session ${sessionId}] 列出所有会话`);
    const threads = await core.getSessionManager().listAllThreads();
    return { sessions: threads };
  });

  bridge.registerHandler("getSession", async (params: unknown, sessionId: string) => {
    const { threadId } = params as { threadId: string };
    console.log(`[Session ${sessionId}] 获取会话: ${threadId}`);
    const messages = await core.getSessionManager().loadSession(threadId);
    return { threadId, messages };
  });

  bridge.registerHandler("deleteSession", async (params: unknown, sessionId: string) => {
    const { threadId } = params as { threadId: string };
    console.log(`[Session ${sessionId}] 删除会话: ${threadId}`);
    await core.getSessionManager().deleteSession(threadId);
    return { success: true };
  });

  bridge.registerHandler("getTools", async (_params: unknown, sessionId: string) => {
    console.log(`[Session ${sessionId}] 获取工具列表`);
    const tools = core.getTools();
    return { tools };
  });

  bridge.registerHandler("getAgents", async (_params: unknown, sessionId: string) => {
    console.log(`[Session ${sessionId}] 获取 Agent 列表`);
    const agents = [
      { id: "assistant", name: "Assistant", description: "General purpose assistant" },
      { id: "coder", name: "Coder", description: "Specialized in code generation and debugging" },
      { id: "analyst", name: "Analyst", description: "Data analysis and research" },
    ];
    return { agents };
  });

  bridge.on("connected", () => {
    console.log("🔗 客户端已连接");
  });

  bridge.on("disconnected", () => {
    console.log("🔌 客户端已断开");
  });

  bridge.on("error", (err: Error) => {
    console.error("❌ Bridge 错误:", err.message);
  });

  await bridge.start();
  console.log(`🌐 WebSocket 服务已启动: ws://localhost:${port}`);
  console.log("\n✅ 服务器已就绪，等待客户端连接...\n");

  process.on("SIGINT", async () => {
    console.log("\n👋 正在关闭服务器...");
    await bridge.stop();
    core.shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n👋 正在关闭服务器...");
    await bridge.stop();
    core.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
