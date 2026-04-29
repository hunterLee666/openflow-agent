import { Box, Text } from 'ink'
import React, { useMemo } from 'react'
import { UnaryEvent } from '@hooks/usePermissionRequestLogging'
import { savePermission } from '@permissions'
import { BashTool } from '@tools/BashTool/BashTool'
import { getTheme } from '@utils/theme'
import { usePermissionRequestLogging } from '@components/permissions/hooks'
import {
  type ToolUseConfirm,
  toolUseConfirmGetPrefix,
} from '@components/permissions/PermissionRequest'
import { PermissionRequestTitle } from '@components/permissions/PermissionRequestTitle'
import { logUnaryPermissionEvent } from '@components/permissions/utils'
import { Select } from '@components/custom-select/select'
import { toolUseOptions } from '@components/permissions/toolUseOptions'
import { Card, Badge } from '@components/base'

type Props = {
  toolUseConfirm: ToolUseConfirm
  onDone(): void
}

export function BashPermissionRequest({
  toolUseConfirm,
  onDone,
}: Props): React.ReactNode {
  const theme = getTheme()

  const { command, run_in_background, description } =
    BashTool.inputSchema.parse(toolUseConfirm.input)

  const unaryEvent = useMemo<UnaryEvent>(
    () => ({ completion_type: 'tool_use_single', language_name: 'none' }),
    [],
  )

  usePermissionRequestLogging(toolUseConfirm, unaryEvent)

  return (
    <Card
      marginTop={1}
      paddingY={1}
      borderColorKey="border"
    >
      <PermissionRequestTitle
        title={
          <Box gap={1}>
            <Badge color="error">!</Badge>
            <Text>Bash command</Text>
          </Box>
        }
        riskScore={toolUseConfirm.riskScore}
      />
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text>
          {BashTool.renderToolUseMessage({
            command,
            run_in_background,
            description,
          })}
        </Text>
        <Text color={theme.textDim}>{toolUseConfirm.description}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold color={theme.text}>
          Proceed?
        </Text>
        <Select
          options={toolUseOptions({ toolUseConfirm, command })}
          onChange={newValue => {
            switch (newValue) {
              case 'yes':
                logUnaryPermissionEvent(
                  'tool_use_single',
                  toolUseConfirm,
                  'accept',
                )
                toolUseConfirm.onAllow('temporary')
                onDone()
                break
              case 'yes-dont-ask-again-prefix': {
                const prefix = toolUseConfirmGetPrefix(toolUseConfirm)
                if (prefix !== null) {
                  logUnaryPermissionEvent(
                    'tool_use_single',
                    toolUseConfirm,
                    'accept',
                  )
                  savePermission(
                    toolUseConfirm.tool,
                    toolUseConfirm.input,
                    prefix,
                    toolUseConfirm.toolUseContext,
                  ).then(() => {
                    toolUseConfirm.onAllow('permanent')
                    onDone()
                  })
                }
                break
              }
              case 'yes-dont-ask-again-full':
                logUnaryPermissionEvent(
                  'tool_use_single',
                  toolUseConfirm,
                  'accept',
                )
                savePermission(
                  toolUseConfirm.tool,
                  toolUseConfirm.input,
                  null,
                  toolUseConfirm.toolUseContext,
                ).then(() => {
                  toolUseConfirm.onAllow('permanent')
                  onDone()
                })
                break
              case 'no':
                logUnaryPermissionEvent(
                  'tool_use_single',
                  toolUseConfirm,
                  'reject',
                )
                toolUseConfirm.onReject()
                onDone()
                break
            }
          }}
        />
      </Box>
    </Card>
  )
}
