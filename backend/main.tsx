import React from "react";
import { render } from "ink";
import { App } from "../frontend/tui/app.js";
import { OpenFlowCore } from "./openflow-core.js";
import type { OpenFlowConfig } from "./openflow-core.js";
import type { Message } from "../frontend/tui/components/Message.js";
import type { CapabilityContext, CapabilitySource } from "./types/index.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";

interface CliAppProps {
  workspaceRoot?: string;
  apiKey?: string;
  model?: string;
  provider?: string;
  baseUrl?: string;
}

function CliApp({
  workspaceRoot = process.cwd(),
  apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "",
  model = process.env.OPENFLOW_MODEL || "gpt-4",
  provider = process.env.OPENFLOW_PROVIDER || "openai",
  baseUrl = process.env.OPENFLOW_BASE_URL,
}: CliAppProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [core, setCore] = React.useState<OpenFlowCore | null>(null);
  const [isInitialized, setIsInitialized] = React.useState(false);

  React.useEffect(() => {
    async function init() {
      try {
        const memoryDir = join(homedir(), ".openflow", "memory");
        if (!existsSync(memoryDir)) {
          mkdirSync(memoryDir, { recursive: true });
        }

        const sessionsDir = join(homedir(), ".openflow", "sessions");
        if (!existsSync(sessionsDir)) {
          mkdirSync(sessionsDir, { recursive: true });
        }

        const config: OpenFlowConfig = {
          workspaceRoot,
          memoryDir,
          pluginSources: [] as CapabilitySource[],
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

        const mockCapabilityContext: CapabilityContext = {
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
        } as unknown as CapabilityContext;

        const coreInstance = new OpenFlowCore(mockCapabilityContext, config);

        await coreInstance.initialize();
        setCore(coreInstance);
        setIsInitialized(true);

        const welcomeMessage: Message = {
          id: "system-welcome",
          role: "assistant",
          content: [{ type: "text", text: `OpenFlow CLI 已启动。工作目录: ${workspaceRoot}` }],
          timestamp: Date.now(),
        };
        setMessages([welcomeMessage]);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`初始化失败: ${errorMsg}`);
        console.error("Failed to initialize OpenFlowCore:", err);
      }
    }

    init();

    return () => {
      core?.shutdown?.();
    };
  }, []);

  const handleSendMessage = React.useCallback(
    async (text: string) => {
      if (!core || !isInitialized) {
        setError("系统尚未初始化完成");
        return;
      }

      setIsLoading(true);
      setError(null);

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);

      try {
        const result = await core.executeQuery({
          message: text,
        });

        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: [{ type: "text", text: result.content || "处理完成" }],
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`处理请求失败: ${errorMsg}`);
      } finally {
        setIsLoading(false);
      }
    },
    [core, isInitialized]
  );

  const handleExit = React.useCallback(() => {
    core?.shutdown?.();
    process.exit(0);
  }, [core]);

  if (!isInitialized && !error) {
    return (
      <App
        title="OpenFlow CLI"
        subtitle="正在初始化..."
        messages={[]}
        isLoading={true}
        onExit={handleExit}
      />
    );
  }

  return (
    <App
      title="OpenFlow CLI"
      subtitle={`工作目录: ${workspaceRoot} | 模型: ${model}`}
      messages={messages}
      onSendMessage={handleSendMessage}
      onExit={handleExit}
      isLoading={isLoading}
      error={error}
    />
  );
}

async function main() {
  const args = process.argv.slice(2);
  const props: CliAppProps = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--workspace":
      case "-w":
        props.workspaceRoot = args[++i];
        break;
      case "--api-key":
      case "-k":
        props.apiKey = args[++i];
        break;
      case "--model":
      case "-m":
        props.model = args[++i];
        break;
      case "--provider":
      case "-p":
        props.provider = args[++i];
        break;
      case "--base-url":
      case "-b":
        props.baseUrl = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(`
OpenFlow CLI - AI 编码助手

用法:
  openflow [选项]

选项:
  -w, --workspace <path>    工作目录 (默认: 当前目录)
  -k, --api-key <key>       API 密钥 (或设置 OPENAI_API_KEY / ANTHROPIC_API_KEY)
  -m, --model <model>       模型名称 (默认: gpt-4)
  -p, --provider <provider> 提供商名称 (默认: openai)
  -b, --base-url <url>      基础 URL
  -h, --help                显示帮助信息

环境变量:
  OPENAI_API_KEY      OpenAI API 密钥
  ANTHROPIC_API_KEY   Anthropic API 密钥
  OPENFLOW_MODEL      默认模型
  OPENFLOW_PROVIDER   默认提供商
  OPENFLOW_BASE_URL   基础 URL
        `);
        process.exit(0);
        break;
    }
  }

  render(
    <CliApp {...props} />,
    {
      exitOnCtrlC: false,
      patchConsole: false,
    }
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
