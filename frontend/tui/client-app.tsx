import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { createBridgeClient } from "../../backend/bridge/client.js";
import type { BridgeClient } from "../../backend/bridge/client.js";
import type { Message } from "./components/Message.js";
import type { WebSocketConfig } from "../../backend/transport/types.js";
import { z } from "zod";

export const TuiClientAppPropsSchema = z.object({
  workspaceRoot: z.string().optional(),
  wsUrl: z.string().optional(),
})
export type TuiClientAppProps = z.infer<typeof TuiClientAppPropsSchema>

function TuiClientApp({
  workspaceRoot = process.cwd(),
  wsUrl = process.env.OPENFLOW_WS_URL || "ws://localhost:8765",
}: TuiClientAppProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [bridgeClient, setBridgeClient] = React.useState<BridgeClient | null>(null);
  const [isConnected, setIsConnected] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState("正在连接...");

  React.useEffect(() => {
    async function init() {
      try {
        console.log(`正在连接到 ${wsUrl}...`);

        const wsConfig: WebSocketConfig = {
          type: "websocket",
          url: wsUrl,
        };

        const client = createBridgeClient({
          transportConfig: wsConfig,
          autoHandshake: true,
          defaultTimeout: 60000,
        });

        client.on("connected", () => {
          console.log("已连接到服务器");
          setIsConnected(true);
          setConnectionStatus("已连接");

          const welcomeMessage: Message = {
            id: "system-welcome",
            role: "assistant",
            content: [{ type: "text", text: `OpenFlow 已连接到服务器 (${wsUrl})` }],
            timestamp: Date.now(),
          };
          setMessages([welcomeMessage]);
        });

        client.on("disconnected", () => {
          setIsConnected(false);
          setConnectionStatus("已断开");
          setError("与服务器连接已断开");
        });

        client.on("error", (err: Error) => {
          console.error("Bridge 错误:", err);
          setError(`连接错误: ${err.message}`);
        });

        client.on("notification", (notification: any) => {
          console.log("收到通知:", notification);
        });

        await client.connect();
        setBridgeClient(client);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`连接服务器失败: ${errorMsg}`);
        setConnectionStatus("连接失败");
        console.error("Failed to connect to server:", err);
      }
    }

    init();

    return () => {
      bridgeClient?.disconnect();
    };
  }, []);

  const handleSendMessage = React.useCallback(
    async (text: string) => {
      if (!bridgeClient || !isConnected) {
        setError("未连接到服务器");
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
        const result = await bridgeClient.call<{
          content: string;
          threadId: string;
          turn: number;
          usage: { inputTokens: number; outputTokens: number; totalTokens: number };
        }>("query", { message: text });

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

        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: [{ type: "text", text: `错误: ${errorMsg}` }],
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [bridgeClient, isConnected]
  );

  const handleExit = React.useCallback(() => {
    bridgeClient?.disconnect();
    process.exit(0);
  }, [bridgeClient]);

  if (!isConnected && !error) {
    return (
      <App
        title="OpenFlow CLI"
        subtitle={connectionStatus}
        messages={[]}
        isLoading={true}
        onExit={handleExit}
      />
    );
  }

  return (
    <App
      title="OpenFlow CLI"
      subtitle={`工作目录: ${workspaceRoot} | 状态: ${connectionStatus}`}
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
  const props: TuiClientAppProps = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--workspace":
      case "-w":
        props.workspaceRoot = args[++i];
        break;
      case "--ws-url":
      case "-u":
        props.wsUrl = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(`
OpenFlow CLI - AI 编码助手客户端

用法:
  openflow-cli [选项]

选项:
  -w, --workspace <path>    工作目录 (默认: 当前目录)
  -u, --ws-url <url>        WebSocket 服务器地址 (默认: ws://localhost:8765)
  -h, --help                显示帮助信息

环境变量:
  OPENFLOW_WS_URL    WebSocket 服务器地址
        `);
        process.exit(0);
        break;
    }
  }

  render(
    <TuiClientApp {...props} />,
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
