export { BoundedUUIDSet, LRUSet, BoundedSetWithMetrics } from './bounded-set.js';
export type { BoundedSetMetrics } from './bounded-set.js';

export {
  verifyJwt,
  signJwt,
  decodeJwtPayload,
  JwtKeyRotator,
} from './jwt-auth.js';
export type {
  JwtClaims,
  JwtVerifyOptions,
  JwtVerifyResult,
  JwtSignOptions,
  JwtKeyRotationConfig,
} from './jwt-auth.js';

export {
  isRpcRequest,
  isRpcResponse,
  isRpcNotification,
  createRpcRequest,
  createRpcResponse,
  createRpcNotification,
  createRpcError,
  RpcErrorCode,
  DEFAULT_BRIDGE_CAPABILITIES,
} from './protocol.js';
export type {
  RpcMessage,
  RpcRequest,
  RpcResponse,
  RpcNotification,
  RpcError,
  BridgeCapabilities,
  HandshakeRequest,
  HandshakeResponse,
} from './protocol.js';

export { SessionRunner } from './session-runner.js';
export type {
  Session,
  SessionRunnerConfig,
  SessionRunnerMetrics,
} from './session-runner.js';

export { BridgeMain } from './bridge-main.js';
export type {
  BridgeDependencies,
  BridgeMainConfig,
  BridgeMetrics,
} from './bridge-main.js';

export { BridgeClient, BridgeRpcError, createBridgeClient } from './client.js';
export type { BridgeClientOptions } from './client.js';
