import React from 'react';
import { Box, Text } from 'ink';
import { Card } from '@components/base';
import { getToolDescription } from '@tools/descriptions';
import type { ToolUseConfirm } from './PermissionRequestTypes';

export interface PermissionRequestProps {
  toolUseConfirm: ToolUseConfirm;
  onDone: () => void;
  verbose: boolean;
}

export function PermissionRequest({ toolUseConfirm, verbose = false }: PermissionRequestProps): React.ReactNode {
  const { tool, input } = toolUseConfirm;
  const desc = getToolDescription(tool.name);
  const title = desc?.userFacingName?.(input) || tool.name;
  const message = desc?.renderToolUseMessage?.(input, { verbose }) || `${tool.name}: ${JSON.stringify(input)}`;

  return (
    <Card borderTitle={title}>
      <Box flexDirection="column" padding={1}>
        <Text>{message}</Text>
      </Box>
    </Card>
  );
}

export function toolUseConfirmGetPrefix(toolUseConfirm: ToolUseConfirm): string | null {
  return toolUseConfirm.commandPrefix as string | null;
}
