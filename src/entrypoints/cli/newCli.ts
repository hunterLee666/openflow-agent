#!/usr/bin/env bun
import { getAgentService } from '../../services/agent.js'

async function main() {
  const args = process.argv.slice(2)
  const prompt = args.join(' ') || 'Hello'

  console.log('OpenFlow CLI - New SDK')
console.log('===================\n')

  const agent = getAgentService({
    permissionMode: 'bypassPermissions',
  })

  console.log(`[Model: ${(agent as any).modelId || 'default'}]\n`)

  let hasOutput = false

  try {
    for await (const event of agent.query(prompt)) {
      switch (event.type) {
        case 'content':
          if (event.content?.type === 'text') {
            process.stdout.write(event.content.text)
            hasOutput = true
          }
          break
        case 'tool_use':
          console.log(`\n[Tool: ${event.tool_use?.name}]\n`)
          break
        case 'result':
          console.log('\n[Done]')
          break
        case 'error':
          console.error('Error:', event)
          break
      }
    }

    if (!hasOutput) {
      console.log('(No text output)')
    }

    console.log('\n-------------------')
    console.log('Messages:', agent.getMessages().length)

  } catch (error) {
    console.error('Failed:', error)
    process.exit(1)
  }
}

main()