import { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Box, Text } from 'ink'
import * as React from 'react'
import { Tool } from '@tool'
import { Message, UserMessage } from '@query'
import { useGetToolFromMessages } from './utils'

type Props = {
  param: ToolResultBlockParam
  message: UserMessage
  messages: Message[]
  verbose: boolean
  tools: Tool[]
  width: number | string
}

export function UserToolSuccessMessage({
  param,
  message,
  messages,
  tools,
  verbose,
  width,
}: Props): React.ReactNode {
  const { tool } = useGetToolFromMessages(param.tool_use_id, tools, messages)

  // Access toolUseResult from the nested message structure
  const resultData = (message as any).message?.toolUseResult?.data;

  const rendered = tool.renderToolResultMessage?.(resultData as never, {
    verbose,
  })

  // Ensure rendered content is valid Ink elements
  const content = (() => {
    if (React.isValidElement(rendered)) return rendered
    if (Array.isArray(rendered)) {
      return rendered.map((item, i) =>
        typeof item === 'string' ? <Text key={i}>{item}</Text> : item
      )
    }
    if (typeof rendered === 'string') return <Text>{rendered}</Text>
    return rendered
  })()

  return <Box flexDirection="column" width={width}>{content}</Box>
}
