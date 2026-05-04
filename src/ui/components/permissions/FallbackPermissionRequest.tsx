import { Box, Text } from 'ink';
import React from 'react';
import { getTheme } from '@utils/theme';
import { PermissionRequestTitle, textColorForRiskScore } from './PermissionRequestTitle';

type Props = {
  toolUseConfirm: {
    tool: { name: string };
    input: any;
    description?: string;
    onDone: () => void;
    onAllow: (type: 'once' | 'permanent') => void;
    onAbort: () => void;
  };
  onDone: () => void;
  verbose: boolean;
};

export function FallbackPermissionRequest({
  toolUseConfirm,
}: Props): React.ReactNode {
  const theme = getTheme();
  const userFacingName = toolUseConfirm.tool.name;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={textColorForRiskScore(null)}
      marginTop={1}
      paddingLeft={1}
      paddingRight={1}
      paddingBottom={1}
    >
      <PermissionRequestTitle
        title="Tool use"
        riskScore={null}
      />
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text>
          {userFacingName}({JSON.stringify(toolUseConfirm.input)})
        </Text>
        {toolUseConfirm.description && (
          <Text color={theme.secondaryText}>{toolUseConfirm.description}</Text>
        )}
      </Box>
    </Box>
  );
}
