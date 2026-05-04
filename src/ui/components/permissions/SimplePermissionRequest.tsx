import * as React from 'react';
import { Box, Text } from 'ink';
import { Card } from '@components/base';
import type { ToolUseConfirm } from './PermissionRequest';
import { getToolDescription } from '@tools/descriptions';

// Basic permission request UI that works with any tool
export function SimplePermissionRequest(props: {
  toolUseConfirm: ToolUseConfirm;
  onDone: () => void;
  verbose?: boolean;
}) {
  const { tool, input } = toolUseConfirm;
  const desc = getToolDescription(tool.name);
  const verbose = props.verbose;

  return (
    <Card borderTitle={desc?.userFacingName?.(input) || tool.name}>
      <Box flexDirection="column" padding={1}>
        <Text>{desc?.renderToolUseMessage?.(input, { verbose }) || `Tool: ${tool.name}`}</Text>
      </Box>
    </Card>
  );
}

// Wrapper for FallbackPermissionRequest
export function FallbackPermissionRequest(props: { toolUseConfirm: ToolUseConfirm; onDone: () => void; verbose: boolean }) {
  return <SimplePermissionRequest {...props} />;
}
