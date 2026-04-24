#!/usr/bin/env bun
import React, { useState, useEffect, useCallback } from "react";
import { render } from "ink";
import { Command } from "commander";
import App from "../frontend/tui/app.js";
import { loadConfig } from "./services/config.js";
import type { Message } from "../frontend/tui/components/Message.js";
import type { QueryContext, QueryInput } from "./types/index.js";
import { createMessageId } from "./types/index.js";
import { query } from "./core/query-engine.js";
import { streamEventToUIMessage } from "../frontend/tui/query-integration.js";
import {
  initializeSystemServices,
  getSystemServices,
  createIntegratedQueryContext,
  executeWithErrorHandling,
} from "./integration/index.js";

const program = new Command();

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  currentAssistantId: string | null;
  error: string | null;
  abortController: AbortController | null;
}

async function initializeApp(): Promise<void> {
  await initializeSystemServices();
}

async function createQueryContext(abortController: AbortController): Promise<QueryContext> {
  return createIntegratedQueryContext(abortController);
}

async function handleQuery(
  input: string,
  abortController: AbortController,
  setState: React.Dispatch<React.SetStateAction<ChatState>>
): Promise<void> {
  const services = getSystemServices();
  if (!services) {
    setState((prev) => ({
      ...prev,
      error: "System services not initialized",
    }));
    return;
  }

  if (input.startsWith("/")) {
    const result = await executeWithErrorHandling(
      () =>
        services.commandRegistry.execute(input, {
          cwd: process.cwd(),
          memory: services.memorySystem,
          config: undefined,
        }),
      { operationId: "command-execution", skipRetry: true }
    );

    if (result.success) {
      const assistantMessage: Message = {
        id: createMessageId(),
        role: "assistant",
        content: [{ type: "text", text: result.result || "" }],
        timestamp: Date.now(),
      };
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }));
    } else {
      setState((prev) => ({
        ...prev,
        error: result.error || "Command execution failed",
      }));
    }
    return;
  }

  const userMessage: Message = {
    id: createMessageId(),
    role: "user",
    content: [{ type: "text", text: input }],
    timestamp: Date.now(),
  };

  setState((prev) => ({
    ...prev,
    messages: [...prev.messages, userMessage],
  }));

  const assistantId = createMessageId();
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
    const ctx = await createQueryContext(abortController);
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
    abortController: null,
  });

  useEffect(() => {
    initializeApp().catch(console.error);
  }, []);

  const handleSendMessage = useCallback(
    async (input: string) => {
      const abortController = new AbortController();
      setState((prev) => ({ ...prev, abortController, isLoading: true, error: null }));
      await handleQuery(input, abortController, setState);
    },
    []
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

    await initializeApp();

    const services = getSystemServices();
    if (!services) {
      console.error("Error: System services not initialized");
      process.exit(1);
    }

    if (message) {
      if (message.startsWith("/")) {
        const result = await services.commandRegistry.execute(message, {
          cwd: process.cwd(),
        });
        console.log(result);
        return;
      }

      const ctx = await createQueryContext(new AbortController());
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
