#!/usr/bin/env bun
import { Agent } from '@codeany/open-agent-sdk'
import { getAllBaseTools } from '@codeany/open-agent-sdk/dist/tools/index.js'
import readline from 'readline'

const tools = getAllBaseTools()
console.log(`Loaded ${tools.length} tools: ${tools.map(t => t.name).join(', ')}\n`)

const agent = new Agent({
  model: process.env.CODEANY_MODEL || 'claude-sonnet-4-6-20250514',
  permissionMode: 'bypassPermissions',
})

console.log('OpenFlow CLI (New SDK)')
console.log('Type your message (Ctrl+C to quit)\n')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

async function chat(prompt: string) {
  let hasContent = false

  try {
    for await (const event of agent.query(prompt)) {
      switch (event.type) {
        case 'content':
          if (event.content?.type === 'text') {
            process.stdout.write(event.content.text)
            hasContent = true
          }
          break
        case 'tool_use':
          console.log('\n[Tool: ' + event.tool_use?.name + ']')
          break
        case 'result':
          if (event.subtype === 'error') {
            console.log('\n[Error: ' + (event.error || event.message) + ']')
          } else {
            console.log('\n[Done]')
          }
          break
      }
    }
  } catch (error: any) {
    console.error('\nError:', error.message)
  }

  if (!hasContent) {
    console.log('(No response)')
  }
}

function ask() {
  rl.question('> ', async (input) => {
    if (!input.trim()) {
      ask()
      return
    }
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      rl.close()
      return
    }
    if (input.toLowerCase() === 'clear') {
      agent.clear()
      console.log('History cleared\n')
      ask()
      return
    }
    await chat(input)
    console.log('')
    ask()
  })
}

console.log('Commands: exit, quit, clear\n')
ask()