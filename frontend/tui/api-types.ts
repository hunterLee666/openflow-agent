import { z } from 'zod';

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  result: z.string().optional(),
  status: z.enum(['pending', 'running', 'success', 'error']).optional(),
});

export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(z.unknown())]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
});

export type Message = z.infer<typeof MessageSchema>;

export const QueryRequestSchema = z.object({
  message: z.string(),
  threadId: z.string().optional(),
  model: z.string().optional(),
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export const QueryResponseSchema = z.object({
  content: z.string(),
  threadId: z.string(),
  turn: z.number(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
  }),
});

export type QueryResponse = z.infer<typeof QueryResponseSchema>;

export const ListSessionsResponseSchema = z.object({
  sessions: z.array(z.string()),
});

export type ListSessionsResponse = z.infer<typeof ListSessionsResponseSchema>;

export const GetSessionResponseSchema = z.object({
  threadId: z.string(),
  messages: z.array(MessageSchema),
});

export type GetSessionResponse = z.infer<typeof GetSessionResponseSchema>;

export const DeleteSessionResponseSchema = z.object({
  success: z.boolean(),
});

export type DeleteSessionResponse = z.infer<typeof DeleteSessionResponseSchema>;

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.unknown(),
});

export const GetToolsResponseSchema = z.object({
  tools: z.array(ToolSchema),
});

export type GetToolsResponse = z.infer<typeof GetToolsResponseSchema>;

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export const GetAgentsResponseSchema = z.object({
  agents: z.array(AgentSchema),
});

export type GetAgentsResponse = z.infer<typeof GetAgentsResponseSchema>;

export interface StreamEvent {
  kind: 'assistant_text_delta' | 'tool_input_delta' | 'thinking_delta' | 'tool_call' | 'tool_result' | 'completion' | 'error';
  text?: string;
  partialJson?: string;
  thinking?: string;
  toolCall?: unknown;
  toolName?: string;
  result?: string;
  error?: string;
}
