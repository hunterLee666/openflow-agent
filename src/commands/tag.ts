import { Command } from '@commands'
import { getOpenFlowAgentSessionId } from '@utils/protocol/openflowAgentSessionId'
import { appendSessionTagRecord } from '@utils/protocol/openflowAgentSessionLog'

const tag = {
  type: 'local',
  name: 'tag',
  description: 'Set a tag for the current session',
  isEnabled: true,
  isHidden: false,
  userFacingName() {
    return 'tag'
  },
  async call(args, _context) {
    const value = args.trim()
    if (!value) return 'Usage: /tag <tag>'

    appendSessionTagRecord({
      sessionId: getOpenFlowAgentSessionId(),
      tag: value,
    })

    return `Session tagged as: ${value}`
  },
} satisfies Command

export default tag
