import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { StreamEvent, QueryResult, AgentConfig } from "../types/index.js";
import { query } from "../core/query-engine.js";
import { DefaultToolRegistry } from "../tools/registry.js";
import { getDefaultTools } from "../tools/file-tools.js";
import { FileSessionStore } from "../services/session.js";
import { ConsoleTelemetry } from "../services/telemetry.js";
import { DefaultMemorySystem } from "../memory/index.js";
import { DefaultHookRegistry, createBuiltInHooks } from "../hooks/index.js";

interface AppProps {
  config: AgentConfig;
  initialMessage?: string;
}

export default function App({ config, initialMessage }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>(undefined);

  const toolRegistry = new DefaultToolRegistry();
  getDefaultTools().forEach((t) => toolRegistry.register(t));

  const session = new FileSessionStore();
  const telemetry = new ConsoleTelemetry();
  const memory = new DefaultMemorySystem();
  const hooks = new DefaultHookRegistry();
  createBuiltInHooks().forEach((h) => hooks.register(h));

  const sendMessage = useCallback(
    async (text: string) => {
      setMessages((prev) => [...prev, { role: "user", text }]);
      setIsLoading(true);
      setCurrentResponse("");

      const abortController = new AbortController();

      const ctx = {
        session,
        config,
        telemetry,
        abortSignal: abortController.signal,
        toolRegistry,
        memory,
        hooks,
      };

      try {
        const generator = query({ message: text, threadId }, ctx);
        let result: QueryResult | undefined;

        do {
          const { value, done } = await generator.next();
          if (done) {
            result = value;
            break;
          }

          const event = value as StreamEvent;
          if (event.kind === "assistant_text_delta" && event.text) {
            setCurrentResponse((prev) => prev + event.text);
          } else if (event.kind === "thinking_delta" && event.thinking) {
            // Optionally show thinking
          } else if (event.kind === "completion" && event.text) {
            setCurrentResponse((prev) => prev + "\n" + event.text);
          }
        } while (true);

        if (result?.finalText) {
          setMessages((prev) => [...prev, { role: "assistant", text: result!.finalText! }]);
        } else if (currentResponse) {
          setMessages((prev) => [...prev, { role: "assistant", text: currentResponse }]);
        }

        setCurrentResponse("");
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `Error: ${(e as Error).message}` },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [config, threadId, currentResponse],
  );

  useEffect(() => {
    if (initialMessage) {
      sendMessage(initialMessage);
    }
  }, [initialMessage, sendMessage]);

  useInput((inputChar, key) => {
    if (key.return) {
      if (input.trim()) {
        sendMessage(input.trim());
        setInput("");
      }
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if (key.escape) {
      exit();
    } else if (!key.ctrl && !key.meta && inputChar) {
      setInput((prev) => prev + inputChar);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        AI Coding Agent
      </Text>
      <Box marginTop={1} flexDirection="column">
        {messages.map((msg, i) => (
          <Box key={i} marginBottom={1} flexDirection="column">
            <Text bold color={msg.role === "user" ? "green" : "blue"}>
              {msg.role === "user" ? "You" : "Assistant"}:
            </Text>
            <Text>{msg.text}</Text>
          </Box>
        ))}
        {isLoading && currentResponse && (
          <Box marginBottom={1} flexDirection="column">
            <Text bold color="blue">
              Assistant:
            </Text>
            <Text>{currentResponse}</Text>
            <Text color="yellow">▌</Text>
          </Box>
        )}
        {isLoading && !currentResponse && (
          <Text color="yellow">Thinking...</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="green">{"> "}</Text>
        <Text>{input}</Text>
        <Text color="gray">▌</Text>
      </Box>
    </Box>
  );
}
