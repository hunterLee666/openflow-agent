import React from 'react';
import { Box, Text } from 'ink';
import { ChatMessage, type ChatRole } from './chat-message';
import { ChatThread } from './chat-thread';
import { Panel } from './panel';
import { WelcomeScreen } from './welcome-screen';
import { useSessionContext } from '../contexts/session-context';

interface MainContentProps {
  isStreaming?: boolean;
}

const roleMap: Record<string, ChatRole> = {
  user: 'user',
  assistant: 'assistant',
  system: 'system',
  tool: 'assistant',
};

export const MainContent: React.FC<MainContentProps> = ({ isStreaming = false }) => {
  const { getActiveSession } = useSessionContext();
  const activeSession = getActiveSession();
  const messages = Array.isArray(activeSession?.messages) ? activeSession.messages : [];

  console.log('[MainContent] Rendering, messages count:', messages.length, messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 20) : '?' })));

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
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            const isLast = index === messages.length - 1;

            return (
              <ChatMessage
                key={`${msg.tool_call_id ?? ''}-${index}`}
                sender={role}
                timestamp={new Date()}
                streaming={isLast && isStreaming}
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
