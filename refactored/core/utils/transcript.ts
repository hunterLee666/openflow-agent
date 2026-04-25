export type TranscriptEventType =
  | "user_message"
  | "assistant_message"
  | "tool_call"
  | "tool_result"
  | "system_event"
  | "error_event"
  | "compaction_event"
  | "agent_lifecycle"
  | "session_event";

export interface TranscriptEvent {
  id: string;
  type: TranscriptEventType;
  timestamp: number;
  sessionId: string;
  sequence: number;
  data: Record<string, unknown>;
  metadata?: {
    model?: string;
    provider?: string;
    tokens?: number;
    latency?: number;
    tags?: string[];
  };
}

export interface TranscriptFilter {
  type?: TranscriptEventType;
  timeRange?: { start: number; end: number };
  tags?: string[];
  sessionId?: string;
}

export interface TranscriptSummary {
  totalEvents: number;
  eventTypes: Record<string, number>;
  timeRange: { start: number; end: number };
  tokenUsage: { input: number; output: number; total: number };
  errorCount: number;
  toolCallCount: number;
}

export class TranscriptStore {
  private events: TranscriptEvent[] = [];
  private sequenceCounter = 0;
  private maxEvents: number;
  private listeners: Array<(event: TranscriptEvent) => void> = [];

  constructor(maxEvents = 10000) {
    this.maxEvents = maxEvents;
  }

  append(event: Omit<TranscriptEvent, "sequence" | "id">): TranscriptEvent {
    this.sequenceCounter++;
    const completeEvent: TranscriptEvent = {
      ...event,
      id: this.generateId(),
      sequence: this.sequenceCounter,
    };

    this.events.push(completeEvent);

    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    for (const listener of this.listeners) {
      try {
        listener(completeEvent);
      } catch {
        // Ignore listener errors
      }
    }

    return completeEvent;
  }

  query(filter?: TranscriptFilter): TranscriptEvent[] {
    let result = [...this.events];

    if (filter?.type) {
      result = result.filter((e) => e.type === filter.type);
    }

    if (filter?.timeRange) {
      result = result.filter(
        (e) => e.timestamp >= filter.timeRange!.start && e.timestamp <= filter.timeRange!.end
      );
    }

    if (filter?.tags) {
      result = result.filter((e) => {
        const eventTags = e.metadata?.tags || [];
        return filter.tags!.some((tag) => eventTags.includes(tag));
      });
    }

    if (filter?.sessionId) {
      result = result.filter((e) => e.sessionId === filter.sessionId);
    }

    return result;
  }

  getSummary(sessionId?: string): TranscriptSummary {
    const events = sessionId ? this.query({ sessionId }) : this.events;

    const eventTypes: Record<string, number> = {};
    let tokenUsage = { input: 0, output: 0, total: 0 };
    let errorCount = 0;
    let toolCallCount = 0;
    let startTime = Infinity;
    let endTime = 0;

    for (const event of events) {
      eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;

      if (event.metadata?.tokens) {
        tokenUsage.total += event.metadata.tokens;
      }

      if (event.type === "error_event") {
        errorCount++;
      }

      if (event.type === "tool_call") {
        toolCallCount++;
      }

      if (event.timestamp < startTime) startTime = event.timestamp;
      if (event.timestamp > endTime) endTime = event.timestamp;
    }

    return {
      totalEvents: events.length,
      eventTypes,
      timeRange: { start: startTime === Infinity ? 0 : startTime, end: endTime },
      tokenUsage,
      errorCount,
      toolCallCount,
    };
  }

  onChange(listener: (event: TranscriptEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  clear(): void {
    this.events = [];
    this.sequenceCounter = 0;
  }

  export(): TranscriptEvent[] {
    return [...this.events];
  }

  import(events: TranscriptEvent[]): void {
    this.events = [...events];
    this.sequenceCounter = events.length > 0 ? Math.max(...events.map((e) => e.sequence)) : 0;
  }

  private generateId(): string {
    return `evt_${Date.now()}_${this.sequenceCounter}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function createUserMessageEvent(
  sessionId: string,
  content: string,
  metadata?: TranscriptEvent["metadata"]
): Omit<TranscriptEvent, "sequence" | "id"> {
  return {
    type: "user_message",
    timestamp: Date.now(),
    sessionId,
    data: { content },
    metadata,
  };
}

export function createAssistantMessageEvent(
  sessionId: string,
  content: string,
  metadata?: TranscriptEvent["metadata"]
): Omit<TranscriptEvent, "sequence" | "id"> {
  return {
    type: "assistant_message",
    timestamp: Date.now(),
    sessionId,
    data: { content },
    metadata,
  };
}

export function createToolCallEvent(
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>,
  metadata?: TranscriptEvent["metadata"]
): Omit<TranscriptEvent, "sequence" | "id"> {
  return {
    type: "tool_call",
    timestamp: Date.now(),
    sessionId,
    data: { toolName, input },
    metadata,
  };
}

export function createToolResultEvent(
  sessionId: string,
  toolName: string,
  result: string,
  success: boolean,
  metadata?: TranscriptEvent["metadata"]
): Omit<TranscriptEvent, "sequence" | "id"> {
  return {
    type: "tool_result",
    timestamp: Date.now(),
    sessionId,
    data: { toolName, result, success },
    metadata,
  };
}

export function createErrorEvent(
  sessionId: string,
  error: Error,
  context?: Record<string, unknown>,
  metadata?: TranscriptEvent["metadata"]
): Omit<TranscriptEvent, "sequence" | "id"> {
  return {
    type: "error_event",
    timestamp: Date.now(),
    sessionId,
    data: {
      error: error.message,
      stack: error.stack,
      name: error.name,
      context,
    },
    metadata,
  };
}

export function createCompactionEvent(
  sessionId: string,
  tier: number,
  beforeCount: number,
  afterCount: number,
  metadata?: TranscriptEvent["metadata"]
): Omit<TranscriptEvent, "sequence" | "id"> {
  return {
    type: "compaction_event",
    timestamp: Date.now(),
    sessionId,
    data: { tier, beforeCount, afterCount, reduction: beforeCount - afterCount },
    metadata,
  };
}

export function createAgentLifecycleEvent(
  sessionId: string,
  agentId: string,
  action: "start" | "complete" | "error" | "cancel",
  metadata?: TranscriptEvent["metadata"]
): Omit<TranscriptEvent, "sequence" | "id"> {
  return {
    type: "agent_lifecycle",
    timestamp: Date.now(),
    sessionId,
    data: { agentId, action },
    metadata,
  };
}
