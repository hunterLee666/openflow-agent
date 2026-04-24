export type MessagePriority = 'high' | 'normal' | 'low';
export type MessageType = 'request' | 'response' | 'event' | 'error' | 'heartbeat';

export interface AgentMessage<T = unknown> {
  id: string;
  type: MessageType;
  priority: MessagePriority;
  source: string;
  target: string;
  parentId?: string;
  conversationId?: string;
  action?: string;
  payload: T;
  timestamp: Date;
  ttl?: number;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

export interface MessageEnvelope<T = unknown> {
  message: AgentMessage<T>;
  routing: RoutingInfo;
  delivery: DeliveryInfo;
}

export interface RoutingInfo {
  path: string[];
  hops: number;
  estimatedLatency?: number;
  routePolicy: 'direct' | 'broadcast' | 'multicast';
}

export interface DeliveryInfo {
  status: 'pending' | 'delivered' | 'failed' | 'timeout';
  attempts: number;
  lastAttempt?: Date;
  deliveredAt?: Date;
  error?: string;
}

export interface Subscription {
  agentId: string;
  topics: string[];
  filter?: (message: AgentMessage) => boolean;
  callback: (message: AgentMessage) => void | Promise<void>;
  priority: MessagePriority;
  unsubscribe: () => void;
}

export interface MessageRoute {
  from: string;
  to: string;
  priority: MessagePriority;
  messageTypes: MessageType[];
  filter?: (message: AgentMessage) => boolean;
}

export interface RouteConfig {
  routes: MessageRoute[];
  defaultPriority: MessagePriority;
  maxHops: number;
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableTypes: MessageType[];
}

export interface AgentConnection {
  agentId: string;
  status: 'connected' | 'disconnected' | 'reconnecting';
  lastHeartbeat?: Date;
  messageQueue: AgentMessage[];
  subscriptions: Subscription[];
}

export interface MessageBrokerConfig {
  agentId: string;
  routeConfig: RouteConfig;
  enableMetrics: boolean;
  enableTracing: boolean;
}

export interface QueueMetrics {
  queueSize: number;
  processedCount: number;
  failedCount: number;
  averageLatency: number;
}

export interface BrokerMetrics {
  messagesReceived: number;
  messagesDelivered: number;
  messagesFailed: number;
  activeConnections: number;
  queueMetrics: Map<string, QueueMetrics>;
}

export type MessageHandler<T = unknown> = (
  message: AgentMessage<T>
) => void | Promise<void>;

export interface SendOptions {
  priority?: MessagePriority;
  timeout?: number;
  retry?: boolean;
  trackDelivery?: boolean;
}

export interface BatchOptions {
  batchSize: number;
  batchTimeoutMs: number;
  preserveOrder?: boolean;
}