export type AgentId = string;
export type SessionId = string;
export type TaskId = string;
export type ThreadId = string;
export type MessageId = string;

export function createAgentId(prefix: string = "agent"): AgentId {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

export function createSessionId(): SessionId {
  return createAgentId("session");
}

export function createTaskId(prefix: string = "task"): TaskId {
  return createAgentId(prefix);
}

export function createMessageId(prefix: string = "msg"): MessageId {
  return createAgentId(prefix);
}

export function isAgentId(value: string): value is AgentId {
  return value.startsWith("agent_") || value.startsWith("a_");
}

export function isSessionId(value: string): value is SessionId {
  return value.startsWith("session_");
}

export function isTaskId(value: string): value is TaskId {
  return value.startsWith("task_") || value.startsWith("a_") || value.startsWith("b_") || value.startsWith("r_");
}
