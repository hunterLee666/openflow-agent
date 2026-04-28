import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  QueryRequest,
  QueryResponse,
  ListSessionsResponse,
  GetSessionResponse,
  DeleteSessionResponse,
  GetToolsResponse,
  GetAgentsResponse,
  StreamEvent,
} from '../api-types';

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

export interface StreamChunk {
  chunk: string;
  contentLength: number;
  isFirst: boolean;
}

export interface BridgeClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(request: QueryRequest): Promise<QueryResponse>;
  streamQuery(request: QueryRequest): Promise<QueryResponse>;
  onStreamChunk?: (callback: (event: StreamChunk, sessionId?: string) => void) => void;
  listSessions(): Promise<ListSessionsResponse>;
  getSession(threadId: string): Promise<GetSessionResponse>;
  deleteSession(threadId: string): Promise<DeleteSessionResponse>;
  getTools(): Promise<GetToolsResponse>;
  getAgents(): Promise<GetAgentsResponse>;
  isConnected: boolean;
}

export function createBridgeClient(url: string): BridgeClient {
  let ws: WebSocket | null = null;
  let connected = false;
  const pendingRequests = new Map<string, PendingRequest>();
  const streamChunkCallbacks: Array<(event: StreamChunk, sessionId?: string) => void> = [];
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;

  const connect = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        ws = new WebSocket(url);

        ws.onopen = () => {
          connected = true;
          reconnectAttempts = 0;
          resolve();
        };

        ws.onclose = () => {
          connected = false;
          ws = null;
        };

        ws.onerror = (error) => {
          if (!connected) {
            reject(error);
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            let id = message.id;
            let result = message.result;
            let error = message.error;
            let method = message.method;

            if (typeof message.payload === 'string') {
              const parsed = JSON.parse(message.payload);
              id = parsed.id;
              result = parsed.result;
              error = parsed.error;
              method = parsed.method;
            }

            if (id) {
              if (id.startsWith('resp_')) {
                id = id.substring(5);
              } else if (id.startsWith('err_')) {
                id = id.substring(4);
              }
            }

            if (method === 'stream_chunk' && result) {
              for (const cb of streamChunkCallbacks) {
                cb(result as StreamChunk, message.sessionId);
              }
              return;
            }

            if (id && pendingRequests.has(id)) {
              const pending = pendingRequests.get(id)!;
              pendingRequests.delete(id);
              if (error) {
                pending.reject(new Error(error.message || 'Unknown error'));
              } else {
                pending.resolve(result);
              }
            }
          } catch (e) {
            console.error('Failed to parse message:', e);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  };

  const disconnect = async (): Promise<void> => {
    if (ws) {
      ws.close();
      ws = null;
    }
    connected = false;
  };

  const call = async <T>(method: string, params?: unknown): Promise<T> => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to server');
    }

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const payload = JSON.stringify({
        type: "request",
        id,
        method,
        params,
      });
      const request = {
        id,
        type: "request",
        channel: "default",
        payload,
      };

      pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });

      ws!.send(JSON.stringify(request));

      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  };

  const onStreamChunk = (callback: (event: StreamChunk, sessionId?: string) => void) => {
    streamChunkCallbacks.push(callback);
  };

  return {
    connect,
    disconnect,
    query: (request: QueryRequest) => call<QueryResponse>('query', request),
    streamQuery: (request: QueryRequest) => call<QueryResponse>('streamQuery', request),
    onStreamChunk,
    listSessions: () => call<ListSessionsResponse>('listSessions'),
    getSession: (threadId: string) => call<GetSessionResponse>('getSession', { threadId }),
    deleteSession: (threadId: string) => call<DeleteSessionResponse>('deleteSession', { threadId }),
    getTools: () => call<GetToolsResponse>('getTools'),
    getAgents: () => call<GetAgentsResponse>('getAgents'),
    get isConnected() {
      return connected;
    },
  };
}

export interface UseBridgeReturn {
  client: BridgeClient | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  query: (request: QueryRequest) => Promise<QueryResponse>;
  streamQuery: (request: QueryRequest) => Promise<QueryResponse>;
  onStreamChunk: (callback: (event: StreamChunk, sessionId?: string) => void) => void;
  listSessions: () => Promise<ListSessionsResponse>;
  getSession: (threadId: string) => Promise<GetSessionResponse>;
  deleteSession: (threadId: string) => Promise<DeleteSessionResponse>;
  getTools: () => Promise<GetToolsResponse>;
  getAgents: () => Promise<GetAgentsResponse>;
}

const DEFAULT_WS_URL = 'ws://localhost:8765';

export function useBridge(url: string = DEFAULT_WS_URL): UseBridgeReturn {
  const [client, setClient] = useState<BridgeClient | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const bridgeClient = createBridgeClient(url);
      await bridgeClient.connect();
      setClient(bridgeClient);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to connect'));
    } finally {
      setIsConnecting(false);
    }
  }, [url]);

  const disconnect = useCallback(async () => {
    if (client) {
      await client.disconnect();
      setClient(null);
    }
  }, [client]);

  useEffect(() => {
    connect();

    return () => {
      if (client) {
        client.disconnect().catch(console.error);
      }
    };
  }, []);

  return {
    client,
    isConnected: client?.isConnected ?? false,
    isConnecting,
    error,
    connect,
    disconnect,
    query: client?.query.bind(client) ?? (() => Promise.reject(new Error('Not connected'))),
    streamQuery: client?.streamQuery.bind(client) ?? (() => Promise.reject(new Error('Not connected'))),
    onStreamChunk: client ? (client as any).onStreamChunk : (() => {}),
    listSessions: client?.listSessions.bind(client) ?? (() => Promise.reject(new Error('Not connected'))),
    getSession: client?.getSession.bind(client) ?? (() => Promise.reject(new Error('Not connected'))),
    deleteSession: client?.deleteSession.bind(client) ?? (() => Promise.reject(new Error('Not connected'))),
    getTools: client?.getTools.bind(client) ?? (() => Promise.reject(new Error('Not connected'))),
    getAgents: client?.getAgents.bind(client) ?? (() => Promise.reject(new Error('Not connected'))),
  };
}
