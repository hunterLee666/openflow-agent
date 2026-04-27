import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from './theme-provider';
import { useInput } from '../hooks/use-input';
import { Panel } from './panel';
import { Divider } from './divider';
import { Spinner } from './spinner';
import { useSessionContext } from '../contexts/session-context';

interface SessionSidebarProps {
  width?: number;
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  width = 25,
}) => {
  const theme = useTheme();
  const { state, setActiveSession, deleteSession } = useSessionContext();
  const [focusIndex, setFocusIndex] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) {
      setFocusIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setFocusIndex((prev) => Math.min(state.sessions.length - 1, prev + 1));
    } else if (key.return) {
      const session = state.sessions[focusIndex];
      if (session) {
        setActiveSession(session.id);
      }
    } else if (key.delete) {
      const session = state.sessions[focusIndex];
      if (session && state.sessions.length > 1) {
        deleteSession(session.id);
        setFocusIndex((prev) => Math.max(0, prev - 1));
      }
    }
  });

  return (
    <Panel
      title="Sessions"
      borderStyle="single"
      width={width}
    >
      <Box flexDirection="column">
        <Box
          paddingX={1}
          paddingY={1}
          borderStyle="single"
          borderColor={theme.colors.border}
        >
          <Text bold color="green">
            + New Session
          </Text>
        </Box>

        <Divider />

        {state.isLoading ? (
          <Box paddingX={1} paddingY={1}>
            <Spinner />
            <Text dimColor> Loading...</Text>
          </Box>
        ) : state.sessions.length === 0 ? (
          <Box paddingX={1} paddingY={1}>
            <Text dimColor>No sessions yet</Text>
          </Box>
        ) : (
          state.sessions.map((session, index) => {
            const isActive = session.id === state.activeSessionId;
            const isFocused = index === focusIndex;

            return (
              <Box
                key={session.id}
                flexDirection="column"
                paddingX={1}
                paddingY={1}
                borderStyle="single"
                borderColor={isFocused ? theme.colors.focusRing : 'transparent'}
              >
                <Text
                  bold={isActive}
                  color={isActive ? theme.colors.primary : undefined}
                >
                  {session.title}
                </Text>
                <Text dimColor>
                  {formatTime(session.updatedAt)} {session.messages.length} msgs
                </Text>
              </Box>
            );
          })
        )}
      </Box>
    </Panel>
  );
};
