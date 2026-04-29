import { OpenFlowAgentStructuredStdio } from '@utils/protocol/openflowAgentStructuredStdio'

export function createPrintModeStructuredStdio(args: {
  enabled: boolean
  stdin: any
  stdout: any
  onInterrupt: () => void
  onControlRequest: (msg: any) => Promise<any>
}): OpenFlowAgentStructuredStdio | null {
  if (!args.enabled) return null

  return new OpenFlowAgentStructuredStdio(args.stdin, args.stdout, {
    onInterrupt: args.onInterrupt,
    onControlRequest: args.onControlRequest,
  })
}
