import React from 'react';
import { Box, Text } from 'ink';
import { ChatMessage, type ChatRole } from './chat-message';
import { ChatThread } from './chat-thread';
import { Panel } from './panel';
import { WelcomeScreen } from './welcome-screen';
import { useSessionContext } from '../contexts/session-context';
import type { Message } from '../api-types';
import type { ToolCallItem } from './tool-call-list';

interface MainContentProps {
  isStreaming?: boolean;
}

const roleMap: Record<string, ChatRole> = {
  user: 'user',
  assistant: 'assistant',
  system: 'system',
  tool: 'assistant',
};

interface ContentBlock {
  type: string;
  text?: string;
  content?: string;
}

function extractTextFromContent(content: string | unknown[]): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block: unknown) => {
        const b = block as ContentBlock;
        if (b.type === 'text' && (b.text || b.content)) {
          return b.text ?? b.content ?? '';
        }
        if (typeof block === 'string') {
          return block;
        }
        return JSON.stringify(block);
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(content);
}

export const MainContent: React.FC<MainContentProps> = ({ isStreaming = false }) => {
  const { getActiveSession } = useSessionContext();
  const activeSession = getActiveSession();
  const messages = Array.isArray(activeSession?.messages) ? activeSession.messages : [];

  if (messages.length === 0) {
    return (
      <Panel borderStyle="single">
        <WelcomeScreen appName="OpenFlow CLI" version="0.1.0">
          <Text>Start a conversation by typing below</Text>
        </WelcomeScreen>
      </Panel>
    );
  }

  return (
    <Box flexGrow={1}>
      <Panel borderStyle="single" height={100}>
        <ChatThread>
          {messages.map((msg, index) => {
            const role = roleMap[msg.role] ?? 'assistant';
          const content = extractTextFromContent(msg.content);
            const isLast = index === messages.length - 1;

            const toolCalls: ToolCallItem[] | undefined = msg.toolCalls?.map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: tc.arguments,
              status: (tc.status ?? 'pending') as 'pending' | 'running' | 'success' | 'error',
              result: tc.result,
            }));

            const messageKey = msg.tool_call_id || `msg-${index}`;

            return (
              <ChatMessage
                key={messageKey}
                sender={role}
                timestamp={new Date()}
                streaming={isLast && isStreaming}
                toolCalls={toolCalls}
              >
                {content}
              </ChatMessage>
            );
          })}
        </ChatThread>
      </Panel>
    </Box>
  );
};
