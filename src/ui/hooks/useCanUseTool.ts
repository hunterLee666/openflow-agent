import React, { useCallback } from 'react'
import { hasPermissionsToUseTool } from '@permissions'
import { getCommandSubcommandPrefix } from '@utils/commands'
import {
  REJECT_MESSAGE,
  REJECT_MESSAGE_WITH_FEEDBACK_PREFIX,
} from '@utils/messages'
import { ToolUseConfirm } from '@components/permissions/PermissionRequest'
import { logError } from '@utils/log'
import type { CanUseToolFn } from '@types'

type SetState<T> = React.Dispatch<React.SetStateAction<T>>

export type { CanUseToolFn }

function useCanUseTool(
  setToolUseConfirm: SetState<ToolUseConfirm | null>,
): CanUseToolFn {
  return useCallback<CanUseToolFn>(
    async (tool, input, toolUseContext, assistantMessage) => {
      return new Promise(resolve => {
        function logCancelledEvent() {}

        function resolveWithCancelledAndAbortAllToolCalls(message?: string) {
          resolve({
            result: false,
            message: message
              ? `${REJECT_MESSAGE_WITH_FEEDBACK_PREFIX}${message}`
              : REJECT_MESSAGE,
          })
          toolUseContext.abortController.abort()
        }

        if (toolUseContext.abortController.signal.aborted) {
          logCancelledEvent()
          resolveWithCancelledAndAbortAllToolCalls()
          return
        }

        return hasPermissionsToUseTool(
          tool,
          input,
          toolUseContext,
          assistantMessage,
        )
          .then(async result => {
            if (result.result === true) {
              resolve({ result: true })
              return
            }

            const deniedResult = result as Extract<
              typeof result,
              { result: false }
            >

            if (deniedResult.shouldPromptUser === false) {
              resolve({ result: false, message: deniedResult.message })
              return
            }

            const [description] = await Promise.all([
              typeof tool.description === 'function'
                ? tool.description(input as never)
                : Promise.resolve(tool.description ?? tool.userFacingName?.(input) ?? `Tool: ${tool.name}`),
            ]);
            // For Bash tool, try to get command prefix (if inputSchema available)
            let commandPrefix: string | null = null;
            if (tool.name === 'Bash' && tool.inputSchema) {
              try {
                // Try to parse command from input (simplified)
                const parsed = typeof tool.inputSchema.parse === 'function' ? tool.inputSchema.parse(input) : null;
                const command = typeof parsed === 'object' && parsed ? (parsed as any).command : null;
                if (typeof command === 'string') {
                  commandPrefix = getCommandSubcommandPrefix(command, toolUseContext.abortController.signal);
                }
              } catch (e) {
                // ignore
              }
            }

            if (toolUseContext.abortController.signal.aborted) {
              logCancelledEvent()
              resolveWithCancelledAndAbortAllToolCalls()
              return
            }

            setToolUseConfirm({
              assistantMessage,
              tool,
              description,
              input,
              commandPrefix,
              toolUseContext,
              suggestions: deniedResult.suggestions,
              riskScore: null,
              onAbort() {
                logCancelledEvent()
                resolveWithCancelledAndAbortAllToolCalls()
              },
              onAllow(type) {
                if (type === 'permanent') {
                } else {
                }
                resolve({ result: true })
              },
              onReject(rejectionMessage) {
                resolveWithCancelledAndAbortAllToolCalls(rejectionMessage)
              },
            })
          })
          .catch(error => {
            if (error instanceof AbortError) {
              logCancelledEvent()
              resolveWithCancelledAndAbortAllToolCalls()
            } else {
              logError(error)
            }
          })
      })
    },
    [setToolUseConfirm],
  )
}

export default useCanUseTool
