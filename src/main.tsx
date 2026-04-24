#!/usr/bin/env bun
import React, { useState, useEffect, useRef, useCallback } from "react";
import { render, useInput } from "ink";
import { Command } from "commander";
import App from "./ui/app.js";
import { loadConfig } from "./services/config.js";
import { DefaultToolRegistry } from "./tools/registry.js";
import { getDefaultTools } from "./tools/file-tools.js";
import type { Message } from "./ui/components/Message.js";
import type { StreamEvent, QueryContext, QueryInput } from "./types/index.js";
import { FileSessionStore } from "./services/session.js";
import { ConsoleTelemetry } from "./services/telemetry.js";
import { query } from "./core/query-engine.js";
import { streamEventToUIMessage, queryResultToUIMessage } from "./ui/query-integration.js";
import { DefaultMemorySystem } from "./memory/index.js";
import { DefaultHookRegistry } from "./hooks/registry.js";

const program = new Command();

const toolRegistry = new DefaultToolRegistry();
for (const tool of getDefaultTools()) {
  toolRegistry.register(tool);
}

const sessionStore = new FileSessionStore();
const telemetry = new ConsoleTelemetry();
const memorySystem = new DefaultMemorySystem();
const hookRegistry = new DefaultHookRegistry();

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  currentAssistantId: string | null;
  error: string | null;
}

async function createQueryContext(): Promise<QueryContext> {
  const config = await loadConfig();
  const threadId = await sessionStore.createThread();

  return {
    session: sessionStore,
    config: {
      apiKey: config.apiKey,
      model: config.model,
      maxTokens: 8192,
      maxTurns: 100,
      tokenBudget: 100000,
      compactionThreshold: 80000,
      maxCompactionFailures: 3,
      permissionMode: "askUser",
    },
    telemetry,
    abortSignal: new AbortController().signal,
    toolRegistry,
    memory: memorySystem,
    hooks: hookRegistry,
  };
}

async function handleQuery(
  input: string,
  state: ChatState,
  setState: React.Dispatch<React.SetStateAction<ChatState>>
): Promise<void> {
  const userMessage: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: [{ type: "text", text: input }],
    timestamp: Date.now(),
  };

  setState((prev) => ({
    ...prev,
    messages: [...prev.messages, userMessage],
    isLoading: true,
    error: null,
  }));

  const assistantId = `assistant-${Date.now()}`;
  const streamingMessage: Message = {
    id: assistantId,
    role: "assistant",
    content: [{ type: "text", text: "" }],
    timestamp: Date.now(),
    isStreaming: true,
  };

  setState((prev) => ({
    ...prev,
    messages: [...prev.messages, streamingMessage],
    currentAssistantId: assistantId,
  }));

  try {
    const ctx = await createQueryContext();
    const queryInput: QueryInput = {
      message: input,
    };

    let fullText = "";

    for await (const event of query(queryInput, ctx)) {
      const update = streamEventToUIMessage(event);

      if (update) {
        if (event.kind === "assistant_text_delta") {
          fullText += event.text || "";
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content: [{ type: "text", text: fullText }],
                    isStreaming: true,
                  }
                : msg
            ),
          }));
        } else if (event.kind === "error") {
          setState((prev) => ({
            ...prev,
            error: event.error || "Unknown error",
            messages: prev.messages.map((msg) =>
              msg.id === assistantId
                ? { ...msg, isStreaming: false, isError: true }
                : msg
            ),
          }));
        }
      }

      if (event.kind === "completion" || event.error) {
        break;
      }
    }

    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) =>
        msg.id === assistantId ? { ...msg, isStreaming: false } : msg
      ),
      isLoading: false,
      currentAssistantId: null,
    }));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    setState((prev) => ({
      ...prev,
      error: errorMsg,
      isLoading: false,
      currentAssistantId: null,
      messages: prev.messages.map((msg) =>
        msg.id === assistantId
          ? {
              ...msg,
              content: [{ type: "text", text: `Error: ${errorMsg}` }],
              isStreaming: false,
              isError: true,
            }
          : msg
      ),
    }));
  }
}

function ChatApp(): React.ReactElement {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    currentAssistantId: null,
    error: null,
  });

  const handleSendMessage = useCallback(
    async (input: string) => {
      await handleQuery(input, state, setState);
    },
    [state]
  );

  return (
    <App
      title="OpenFlow CLI"
      subtitle="AI Coding Agent"
      messages={state.messages}
      onSendMessage={handleSendMessage}
      onExit={() => process.exit(0)}
      isLoading={state.isLoading}
      error={state.error}
    />
  );
}

program
  .name("ai-coding-agent")
  .description("AI Coding Agent - inspired by Claude Code architecture")
  .version("0.1.0");

program
  .command("chat [message]")
  .description("Start interactive chat or send a single message")
  .action(async (message?: string) => {
    const config = await loadConfig();
    if (!config.apiKey) {
      console.error("Error: ANTHROPIC_API_KEY not set");
      console.error("Please set ANTHROPIC_API_KEY environment variable");
      process.exit(1);
    }

    if (message) {
      const ctx = await createQueryContext();
      const queryInput: QueryInput = { message };

      let fullResponse = "";

      for await (const event of query(queryInput, ctx)) {
        if (event.kind === "assistant_text_delta") {
          process.stdout.write(event.text || "");
          fullResponse += event.text || "";
        } else if (event.kind === "completion") {
          console.log("\n");
        } else if (event.kind === "error") {
          console.error(`\nError: ${event.error}`);
        }
      }
    } else {
      render(<ChatApp />);
    }
  });

program
  .command("init")
  .description("Initialize configuration")
  .action(async () => {
    console.log("Initializing AI Coding Agent...");
    const config = await loadConfig();
    console.log("Config loaded:", config.model);
  });

program.parse();
