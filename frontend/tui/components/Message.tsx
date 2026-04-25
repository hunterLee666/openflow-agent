import React, { type ReactNode } from "react";
import { Text } from "./Text.js";
import { Box } from "./Box.js";
import { Markdown } from "./Markdown.js";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface MessageContent {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  name?: string;
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  content?: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: MessageContent | MessageContent[];
  timestamp?: number;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface MessageProps {
  message: Message;
  showTimestamp?: boolean;
  maxWidth?: number;
}

const ROLE_COLORS: Record<MessageRole, string> = {
  user: "green",
  assistant: "cyan",
  system: "yellow",
  tool: "magenta",
};

const ROLE_LABELS: Record<MessageRole, string> = {
  user: "You",
  assistant: "Assistant",
  system: "System",
  tool: "Tool",
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ToolUseContent({ content }: { content: MessageContent }): ReactNode {
  return (
    <Box flexDirection="column" gap={1} padding={1}>
      <Text color="yellow" bold>
        🔧 {content.tool_name}
      </Text>
      {content.tool_input && (
        <Text color="dim" style={{ fontFamily: "monospace", fontSize: 12 }}>
          {JSON.stringify(content.tool_input, null, 2)}
        </Text>
      )}
    </Box>
  );
}

function ToolResultContent({ content }: { content: MessageContent }): ReactNode {
  return (
    <Box flexDirection="column" gap={1} padding={1} backgroundColor="#1a1a1a">
      <Text color="green" bold>
        ✓ Result
      </Text>
      {content.content && (
        <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{content.content}</Text>
      )}
    </Box>
  );
}

function TextContent({ content, isError }: { content: MessageContent; isError?: boolean }): ReactNode {
  const text = content.text || content.content || "";
  return (
    <Markdown dimColor={isError}>{text}</Markdown>
  );
}

export function MessageComponent({
  message,
  showTimestamp = true,
  maxWidth = 80,
}: MessageProps): ReactNode {
  const contents = Array.isArray(message.content)
    ? message.content
    : [message.content];

  return (
    <Box flexDirection="column" gap={1} margin={{ bottom: 1 }}>
      <Box flexDirection="row" gap={2} alignItems="center">
        <Text color={ROLE_COLORS[message.role]} bold>
          {ROLE_LABELS[message.role]}
        </Text>
        {message.isStreaming && (
          <Text color="dim" italic>
            streaming...
          </Text>
        )}
        {message.isError && (
          <Text color="red" bold>
            ERROR
          </Text>
        )}
        {showTimestamp && message.timestamp && (
          <Text color="dim" style={{ fontSize: 10 }}>
            {formatTimestamp(message.timestamp)}
          </Text>
        )}
      </Box>

      <Box flexDirection="column" padding={{ left: 2 }}>
        {contents.map((content, index) => {
          switch (content.type) {
            case "tool_use":
              return (
                <ToolUseContent key={`tool-${index}`} content={content} />
              );
            case "tool_result":
              return (
                <ToolResultContent key={`result-${index}`} content={content} />
              );
            case "text":
            default:
              return (
                <TextContent
                  key={`text-${index}`}
                  content={content}
                  isError={message.isError}
                />
              );
          }
        })}
      </Box>
    </Box>
  );
}

export function MessageList({ messages }: { messages: Message[] }): ReactNode {
  return (
    <Box flexDirection="column">
      {messages.map((message) => (
        <MessageComponent key={message.id} message={message} />
      ))}
    </Box>
  );
}

export default MessageComponent;
