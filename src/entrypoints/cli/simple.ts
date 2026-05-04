#!/usr/bin/env bun
import { Agent } from '@codeany/open-agent-sdk'
import readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const agent = new Agent({
  model: process.env.OPENAI_MODEL,
  permissionMode: 'bypassPermissions',
})

console.log('OpenFlow CLI (New SDK)')
console.log('Type your message or "exit" to quit\n> ')

async function ask() {
  const input = await new Promise<string>(resolve => {
    rl.question('', resolve)
  })

  if (input.toLowerCase() === 'exit') {
    rl.close()
    return
  }

  console.log('\n--- Assistant Response ---\n')

  try {
    for await (const event of agent.query(input)) {
      if (event.type === 'content' || event.type === 'message') {
        const content = event.content ?? event.message?.content
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c.type === 'text') {
              process.stdout.write(c.text)
            }
          }
        }
      }
      if (event.type === 'tool_use') {
        console.log(`\n[Using tool: ${event.tool_use?.name}]`)
      }
    }
  } catch (error) {
    console.error('Error:', error)
  }

  console.log('\n')
  ask()
}

ask()