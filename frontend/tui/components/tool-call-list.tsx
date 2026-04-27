import React from 'react';
import { Box, Text } from 'ink';
import { ToolCall, type ToolCallStatus } from './tool-call';

export interface ToolCallItem {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  duration?: number;
}

interface ToolCallListProps {
  toolCalls: ToolCallItem[];
  defaultCollapsed?: boolean;
}

export const ToolCallList: React.FC<ToolCallListProps> = ({
  toolCalls,
  defaultCollapsed = true,
}) => {
  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      <Text dimColor>Tools:</Text>
      {toolCalls.map((toolCall) => (
        <ToolCall
          key={toolCall.id}
          name={toolCall.name}
          args={toolCall.args}
          status={toolCall.status}
          result={toolCall.result}
          duration={toolCall.duration}
          defaultCollapsed={defaultCollapsed}
        />
      ))}
    </Box>
  );
};
