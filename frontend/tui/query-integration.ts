import type {
  Message as QueryMessage,
  StreamEvent,
  QueryResult,
  ContentBlock,
} from "../../backend/types/index.js";
import type { Message } from "./components/Message.js";
import type { AppState } from "./app.js";

export function queryMessageToUIMessage(
  msg: QueryMessage,
  isStreaming = false
): Message {
  const content = Array.isArray(msg.content)
    ? msg.content.map((block) => {
        if (typeof block === "string") {
          return { type: "text" as const, text: block };
        }
        return block as Message["content"] extends Array<infer U> ? U : never;
      })
    : [{ type: "text" as const, text: msg.content }];

  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    role: msg.role,
    content: content as Message["content"],
    timestamp: Date.now(),
    isStreaming,
  };
}

export function streamEventToUIMessage(event: StreamEvent): Partial<Message> | null {
  switch (event.kind) {
    case "assistant_text_delta":
      return {
        content: [{ type: "text", text: event.text || "" }],
        isStreaming: true,
      };

    case "thinking_delta":
      return null;

    case "tool_execution_start":
      return {
        content: [
          {
            type: "tool_use",
            tool_name: event.toolName,
            tool_input: {},
          },
        ],
        isStreaming: true,
      };

    case "tool_execution_end":
      return {
        content: [
          {
            type: "tool_result",
            content: `Tool ${event.toolName} completed`,
          },
        ],
        isStreaming: false,
      };

    case "error":
      return {
        content: [{ type: "text", text: `Error: ${event.error}` }],
        isError: true,
        isStreaming: false,
      };

    case "completion":
      return {
        content: [{ type: "text", text: event.text || "" }],
        isStreaming: false,
      };

    default:
      return null;
  }
}

export function queryResultToUIMessage(result: QueryResult): Message {
  let text = "";

  switch (result.status) {
    case "completed":
      text = result.finalText || "Completed";
      break;
    case "cancelled":
      text = "Cancelled by user";
      break;
    case "budget_exceeded":
      text = `Budget exceeded: ${result.reason}`;
      break;
    case "max_turns_exceeded":
      text = `Max turns exceeded: ${result.reason}`;
      break;
    case "compaction_circuit_breaker":
      text = "Compaction failed too many times";
      break;
    case "fatal_error":
      text = `Error: ${result.reason}`;
      break;
  }

  const isError = result.status !== "completed";

  return {
    id: `result_${Date.now()}`,
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
    isError,
    isStreaming: false,
  };
}

export interface QueryEngineCallbacks {
  onMessage: (message: Message) => void;
  onMessageUpdate: (messageId: string, update: Partial<Message>) => void;
  onLoading: (isLoading: boolean) => void;
  onError: (error: string) => void;
}

export function formatToolUseForDisplay(block: ContentBlock): string {
  if (block.type !== "tool_use") return "";

  const name = block.name || "unknown_tool";
  const input = block.input || {};

  try {
    const inputStr = JSON.stringify(input, null, 2);
    return `[${name}]\n${inputStr}`;
  } catch {
    return `[${name}]\n${String(input)}`;
  }
}

export function formatToolResultForDisplay(block: ContentBlock): string {
  if (block.type !== "tool_result") return "";

  const content = block.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c.type === "text" && c.text) return c.text;
        return JSON.stringify(c);
      })
      .join("\n");
  }

  return String(content);
}

export function extractTextFromMessage(msg: Message): string {
  const contents = Array.isArray(msg.content) ? msg.content : [msg.content];

  return contents
    .map((c) => {
      if (typeof c === "string") return c;
      if (c.type === "text" && c.text) return c.text;
      if (c.type === "tool_result" && c.content) {
        return typeof c.content === "string"
          ? c.content
          : JSON.stringify(c.content);
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
