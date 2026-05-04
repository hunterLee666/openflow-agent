import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  toolUseConfirm: {
    tool: { name: string };
    input: any;
    description?: string;
  };
  onDone: () => void;
  verbose?: boolean;
}

export function MinimalPermissionRequest({ toolUseConfirm, verbose }: Props): React.ReactNode {
  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Box>
        <Text bold>{toolUseConfirm.tool.name}</Text>
        <Text> ({JSON.stringify(toolUseConfirm.input)})</Text>
      </Box>
      {toolUseConfirm.description && (
        <Text color="gray">{toolUseConfirm.description}</Text>
      )}
    </Box>
  );
}
