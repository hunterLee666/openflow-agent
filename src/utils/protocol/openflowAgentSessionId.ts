import { randomUUID } from 'crypto'

let currentSessionId: string = randomUUID()

export function setOpenFlowAgentSessionId(nextSessionId: string): void {
  currentSessionId = nextSessionId
}

export function resetOpenFlowAgentSessionIdForTests(): void {
  currentSessionId = randomUUID()
}

export function getOpenFlowAgentSessionId(): string {
  return currentSessionId
}
