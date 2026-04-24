import type {
  AgentConnection,
  AgentMessage,
  BrokerMetrics,
  MessageBrokerConfig,
  MessageEnvelope,
  QueueMetrics,
  RouteConfig,
  RetryPolicy,
  SendOptions,
  Subscription,
} from './types';

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function calculateBackoff(policy: RetryPolicy, attempt: number): number {
  const delay = Math.min(
    policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt),
    policy.maxDelayMs
  );
  return delay;
}

export class MessageBroker {
  private readonly config: MessageBrokerConfig;
  private readonly routes: Map<string, Subscription[]> = new Map();
  private readonly connections: Map<string, AgentConnection> = new Map();
  private readonly messageQueue: Map<string, AgentMessage[]> = new Map();
  private readonly pendingMessages: Map<string, AgentMessage> = new Map();
  private metrics: BrokerMetrics;
  private heartbeatInterval?: ReturnType<typeof setInterval>;

  constructor(config: MessageBrokerConfig) {
    this.config = config;
    this.metrics = {
      messagesReceived: 0,
      messagesDelivered: 0,
      messagesFailed: 0,
      activeConnections: 0,
      queueMetrics: new Map(),
    };
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.checkConnections();
    }, 30000);
  }

  private checkConnections(): void {
    for (const [agentId, connection] of this.connections) {
      if (connection.status === 'connected' && connection.messageQueue.length > 0) {
        this.flushQueue(agentId);
      }
    }
  }

  subscribe(subscription: Subscription): void {
    for (const topic of subscription.topics) {
      if (!this.routes.has(topic)) {
        this.routes.set(topic, []);
      }
      this.routes.get(topic)!.push(subscription);
    }
  }

  unsubscribe(agentId: string, topics?: string[]): void {
    if (topics) {
      for (const topic of topics) {
        const subs = this.routes.get(topic);
        if (subs) {
          const filtered = subs.filter(s => s.agentId !== agentId);
          this.routes.set(topic, filtered);
        }
      }
    } else {
      for (const [topic, subs] of this.routes) {
        const filtered = subs.filter(s => s.agentId !== agentId);
        if (filtered.length === 0) {
          this.routes.delete(topic);
        } else {
          this.routes.set(topic, filtered);
        }
      }
    }
  }

  async send<T>(message: AgentMessage<T>, options?: SendOptions): Promise<boolean> {
    const priority = options?.priority || this.config.routeConfig.defaultPriority;
    const envelope: MessageEnvelope<T> = {
      message: {
        ...message,
        id: message.id || generateMessageId(),
        priority,
        timestamp: message.timestamp || new Date(),
      },
      routing: {
        path: [this.config.agentId, message.target],
        hops: 1,
        routePolicy: 'direct',
      },
      delivery: {
        status: 'pending',
        attempts: 0,
        lastAttempt: new Date(),
      },
    };

    this.pendingMessages.set(envelope.message.id, envelope.message as AgentMessage);
    this.metrics.messagesReceived++;

    try {
      const delivered = await this.deliver(envelope, options);
      if (delivered) {
        this.metrics.messagesDelivered++;
      } else {
        this.metrics.messagesFailed++;
      }
      return delivered;
    } catch (error) {
      this.metrics.messagesFailed++;
      return false;
    }
  }

  private async deliver<T>(envelope: MessageEnvelope<T>, options?: SendOptions): Promise<boolean> {
    const { message } = envelope;
    const timeout = options?.timeout || this.config.routeConfig.timeout;

    const subs = this.findSubscriptions(message.target, message.type);

    if (subs.length === 0) {
      if (message.parentId) {
        this.queueMessage(message.parentId, message);
        return true;
      }
      return false;
    }

    const promises = subs.map(async (sub) => {
      try {
        const callbackResult = sub.callback(message);
        if (callbackResult instanceof Promise) {
          await callbackResult;
        }
        return true;
      } catch (error) {
        return false;
      }
    });

    const results = await Promise.race([
      Promise.all(promises),
      new Promise<boolean[]>(resolve => setTimeout(() => resolve([false]), timeout)),
    ]);

    return results.some(r => r);
  }

  private findSubscriptions(target: string, type: string): Subscription[] {
    const subs: Subscription[] = [];

    for (const [topic, topicSubs] of this.routes) {
      if (topic === target || topic === '*') {
        for (const sub of topicSubs) {
          if (!sub.filter || sub.filter({ type } as AgentMessage)) {
            subs.push(sub);
          }
        }
      }
    }

    return subs.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private queueMessage(targetAgent: string, message: AgentMessage): void {
    if (!this.messageQueue.has(targetAgent)) {
      this.messageQueue.set(targetAgent, []);
    }
    this.messageQueue.get(targetAgent)!.push(message);
    this.updateQueueMetrics(targetAgent);
  }

  private flushQueue(agentId: string): void {
    const queue = this.messageQueue.get(agentId);
    if (!queue || queue.length === 0) return;

    const connection = this.connections.get(agentId);
    if (!connection || connection.status !== 'connected') return;

    while (queue.length > 0) {
      const message = queue.shift()!;
      const subs = this.findSubscriptions(agentId, message.type);
      for (const sub of subs) {
        sub.callback(message);
      }
    }

    this.updateQueueMetrics(agentId);
  }

  private updateQueueMetrics(agentId: string): void {
    const queue = this.messageQueue.get(agentId);
    const existingMetrics = this.metrics.queueMetrics.get(agentId) || {
      queueSize: 0,
      processedCount: 0,
      failedCount: 0,
      averageLatency: 0,
    };

    this.metrics.queueMetrics.set(agentId, {
      ...existingMetrics,
      queueSize: queue?.length || 0,
    });
  }

  registerConnection(agentId: string): AgentConnection {
    const connection: AgentConnection = {
      agentId,
      status: 'connected',
      lastHeartbeat: new Date(),
      messageQueue: [],
      subscriptions: [],
    };
    this.connections.set(agentId, connection);
    this.metrics.activeConnections = this.connections.size;
    this.flushQueue(agentId);
    return connection;
  }

  disconnect(agentId: string): void {
    const connection = this.connections.get(agentId);
    if (connection) {
      connection.status = 'disconnected';
      this.messageQueue.set(agentId, connection.messageQueue);
    }
    this.metrics.activeConnections = this.connections.size;
  }

  reconnect(agentId: string): void {
    const connection = this.connections.get(agentId);
    if (connection) {
      connection.status = 'reconnecting';
      this.flushQueue(agentId);
      connection.status = 'connected';
      connection.lastHeartbeat = new Date();
    }
  }

  sendHeartbeat(agentId: string): void {
    const connection = this.connections.get(agentId);
    if (connection) {
      connection.lastHeartbeat = new Date();
    }
  }

  async retryMessage(messageId: string): Promise<boolean> {
    const message = this.pendingMessages.get(messageId);
    if (!message) return false;

    const retryCount = message.retryCount || 0;
    const policy = this.config.routeConfig.retryPolicy;

    if (retryCount >= policy.maxRetries) {
      return false;
    }

    const delay = calculateBackoff(policy, retryCount);
    await new Promise(resolve => setTimeout(resolve, delay));

    message.retryCount = retryCount + 1;
    return this.send(message as AgentMessage<unknown>, { retry: true });
  }

  getMetrics(): BrokerMetrics {
    return { ...this.metrics };
  }

  getQueueMetrics(agentId: string): QueueMetrics | undefined {
    return this.metrics.queueMetrics.get(agentId);
  }

  getConnection(agentId: string): AgentConnection | undefined {
    return this.connections.get(agentId);
  }

  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.connections.clear();
    this.messageQueue.clear();
    this.pendingMessages.clear();
    this.routes.clear();
  }
}

export function createMessageBroker(config: MessageBrokerConfig): MessageBroker {
  return new MessageBroker(config);
}