#!/usr/bin/env bun
import { getAgentService } from '../../engine/agentService'
import { asciiLogo } from '../../utils/asciiLogo'
import * as readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const agent = getAgentService()

console.log(asciiLogo)
console.log('OpenFlow CLI - Type your message (Ctrl+C to quit)\n')

async function chat(prompt: string) {
  let hasContent = false

  for await (const raw of agent.query(prompt)) {
    if (raw.type === 'assistant') {
      for (const item of raw.message.content) {
        if (item.type === 'text') {
          process.stdout.write(item.text)
          hasContent = true
        } else if (item.type === 'tool_use') {
          console.log(`\n[Tool: ${item.name}]`)
          if (item.input && Object.keys(item.input).length > 0) {
            console.log(`Input: ${JSON.stringify(item.input, null, 2)}`)
          }
        }
      }
    } else if (raw.type === 'tool_result') {
      if (raw.result.is_error) {
        console.log('\n[Tool error]')
        console.error(raw.result.output)
      } else {
        console.log(`\n[Tool result: ${raw.result.output?.slice(0, 200)}${raw.result.output?.length > 200 ? '...' : ''}]`)
      }
    } else if (raw.type === 'result') {
      if (raw.subtype === 'error') {
        console.log('\n[Query failed]')
        // raw may have errors array or other info
        if (raw.errors) {
          console.error(raw.errors.join('\n'))
        } else {
          console.error('Unknown error (check logs)')
        }
      } else {
        console.log('\n[Complete]')
      }
    } else if (raw.type === 'error') {
      console.log('\n[Agent error]')
      console.error(raw.message)
    }
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