#!/usr/bin/env bun
import '@utils/config/sanitizeAnthropicEnv'
import { initSentry } from '@services/sentry'
import { ensurePackagedRuntimeEnv } from './cli/bootstrapEnv'
import { initDebugLogger } from '@utils/log/debugLogger'
import { enableConfigs } from '@utils/config'
import { logError } from '@utils/log'

import { JsonRpcPeer } from '../acp/jsonrpc'
import { StdioTransport } from '../acp/stdioTransport'
import { installStdoutGuard } from '../acp/stdoutGuard'
import { OpenFlowAcpAgent } from '../acp/openflowAcpAgent'

initSentry()
ensurePackagedRuntimeEnv()

const { writeAcpLine } = installStdoutGuard()

initDebugLogger()
try {
  enableConfigs()
} catch (e) {
  logError(e)
}

const peer = new JsonRpcPeer()
new OpenFlowAcpAgent(peer)

const transport = new StdioTransport(peer, { writeLine: writeAcpLine })
transport.start()
