import { Box, Text } from 'ink'
import * as React from 'react'
import { getTheme } from '@utils/theme'
import { PRODUCT_NAME } from '@constants/product'
import { getGlobalConfig } from '@utils/config'
import { getCwd } from '@utils/state'
import type { WrappedClient } from '@services/mcpClient'
import { getModelManager } from '@utils/model'
import { MACRO } from '@constants/macros'

export const MIN_LOGO_WIDTH = 50

const DEFAULT_UPDATE_COMMANDS = [
  'bun add -g @hunterLee666/openflow@latest',
  'npm install -g @hunterLee666/openflow@latest',
] as const

export function Logo({
  mcpClients,
  isDefaultModel = false,
}: {
  mcpClients: WrappedClient[]
  isDefaultModel?: boolean
}): React.ReactNode {
  const width = Math.max(MIN_LOGO_WIDTH, getCwd().length + 12)
  const theme = getTheme()
  const config = getGlobalConfig()

  const modelManager = getModelManager()
  const mainModelName = modelManager.getModelName('main')
  const currentModel = mainModelName || 'No model configured'
  const hasOverrides = Boolean(
    process.env.DISABLE_PROMPT_CACHING ||
    process.env.API_TIMEOUT_MS ||
    process.env.MAX_THINKING_TOKENS,
  )

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box
        borderColor={theme.primary}
        borderStyle="round"
        flexDirection="column"
        paddingX={1}
        paddingY={0}
        width={width}
      >
        <Box flexDirection="row" paddingY={1} alignItems="center">
          <Text>
            <Text color={theme.primary} bold>◆</Text>{' '}
            <Text bold color={theme.text}>{PRODUCT_NAME}</Text>
            <Text color={theme.textDim}> v{MACRO.VERSION}</Text>
          </Text>
        </Box>
        <Box paddingLeft={1} flexDirection="column">
          <Text color={theme.textMuted}>
            <Text color={theme.info}>▸</Text> {getCwd()}
          </Text>
        </Box>

        {(hasOverrides || mcpClients.length > 0) && (
          <Box
            borderColor={theme.border}
            borderStyle="single"
            borderBottom={false}
            borderLeft={false}
            borderRight={false}
            borderTop={true}
            flexDirection="column"
            marginX={1}
            paddingTop={0}
            marginTop={1}
          >
            {hasOverrides && (
              <Box flexDirection="column" paddingY={0}>
                <Text color={theme.textDim} dimColor>
                  {process.env.DISABLE_PROMPT_CACHING && '○ caching off · '}
                  {process.env.API_TIMEOUT_MS &&
                    `○ timeout ${process.env.API_TIMEOUT_MS}ms · `}
                  {process.env.MAX_THINKING_TOKENS &&
                    `○ max ${process.env.MAX_THINKING_TOKENS}t`}
                </Text>
              </Box>
            )}
            {mcpClients.length > 0 && (
              <Box flexDirection="column" paddingY={0}>
                <Text color={theme.textDim}>
                  MCP:{' '}
                  {mcpClients.map((c, i) => (
                    <Text
                      key={i}
                      color={
                        c.type === 'connected' ? theme.success : theme.error
                      }
                    >
                      {c.name} {c.type === 'connected' ? '●' : '○'}
                    </Text>
                  ))}
                </Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}
