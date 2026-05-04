import type { UUID } from '@types';
import { randomUUID } from 'crypto';
import { getAgentService } from '@engine/agentService';

// Message types compatible with REPL UI
export type UserMessage = {
  type: 'user';
  message: {
    role: 'user';
    content: string | Array<{ type: string; [key: string]: any }>;
    toolUseResult?: {
      data: any;
      isError?: boolean;
    };
  };
  uuid: UUID;
  options?: any;
};

export type AssistantMessage = {
  type: 'assistant';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: any }>;
    model: string;
    stop_reason: string;
    stop_sequence: string | null;
    usage: { input_tokens: number; output_tokens: number };
  };
  uuid: UUID;
  costUSD?: number;
  durationMs?: number;
};

export type ProgressMessage = any;
export type Message = UserMessage | AssistantMessage | ProgressMessage;

// For UI compatibility - binary feedback on assistant message
export type BinaryFeedbackResult = {
  type: 'thumbs' | 'heart';
  value: boolean;
};

function createUserMessage(content: string, uuid?: UUID, options?: any): UserMessage {
  return {
    type: 'user',
    message: { role: 'user', content },
    uuid: uuid || (randomUUID() as UUID),
    options,
  };
}

function createAssistantMessage(event: any): AssistantMessage {
  const eventMessage = event.message || {};
  const content = Array.isArray(eventMessage.content) ? eventMessage.content : [{ type: 'text', text: '' }];
  return {
    type: 'assistant',
    message: {
      ...eventMessage,
      content: content,
      id: eventMessage.id || randomUUID(),
      type: 'message',
      role: 'assistant',
      model: eventMessage.model || 'n/a',
      stop_reason: eventMessage.stop_reason || 'end_turn',
      stop_sequence: eventMessage.stop_sequence || null,
      usage: eventMessage.usage || { input_tokens: 0, output_tokens: 0 },
    },
    uuid: randomUUID() as UUID,
    costUSD: 0,
    durationMs: 0,
  };
}

/**
 * Streamed query function used by REPL
 */
export async function* query(
  messages: Message[],
  _systemPrompt: string[],
  _context: Record<string, string>,
  _canUseTool: any,
  toolUseContext?: any,
): AsyncGenerator<Message, void> {
  const lastUserMsg = messages.filter(m => m.type === 'user').pop();
  if (!lastUserMsg) {
    yield createAssistantMessage({
      message: {
        id: randomUUID(),
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'No user message' }],
        model: 'n/a',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }) as AssistantMessage;
    return;
  }

  const prompt = typeof lastUserMsg.message.content === 'string'
    ? lastUserMsg.message.content
    : JSON.stringify(lastUserMsg.message.content);

  const agent = getAgentService();

  let hasAssistantText = false;
  let eventCount = 0;

  for await (const raw of agent.query(prompt)) {
    eventCount++;
    console.log('[query] received:', JSON.stringify(raw, null, 2));

    if (raw.type === 'assistant') {
      if (!raw.message || !raw.message.content) {
        console.error('[query] Invalid assistant message:', raw);
        continue;
      }
      const content = raw.message.content || [];
      const hasText = content.some((c: any) => c.type === 'text' && c.text && c.text.trim().length > 0);
      if (hasText) {
        hasAssistantText = true;
      }
      yield createAssistantMessage(raw);
    } else if (raw.type === 'tool_result') {
      const result = raw.result;
      if (!result || result.output === undefined) {
        console.error('[query] Invalid tool_result:', raw);
        continue;
      }
      const output = result.output;
      const content = typeof output === 'string' ? output : JSON.stringify(output);
      const toolResultMsg: UserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: result.tool_use_id, content, is_error: result.is_error }],
          toolUseResult: { data: output, isError: result.is_error },
        },
        uuid: randomUUID() as UUID,
      };
      yield toolResultMsg;
    } else if (raw.type === 'partial') {
      console.debug('[query] Partial event:', raw);
    } else {
      console.debug('[query] Ignoring event type:', raw.type);
    }
  }

  console.log('[query] loop ended. eventCount:', eventCount, 'hasAssistantText:', hasAssistantText);
  if (!hasAssistantText && eventCount > 0) {
    yield {
      type: 'assistant',
      message: {
        id: `summary-${randomUUID()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'The command executed successfully. The output has been displayed above.' }],
        model: 'n/a',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      uuid: randomUUID() as UUID,
      costUSD: 0,
      durationMs: 0,
    } as AssistantMessage;
  }
}
