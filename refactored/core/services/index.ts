export { LspClient, startLspForFile, BUILTIN_LSP_SERVERS } from "./lsp-client.js";
export type {
  LspCapabilities,
  LspInitializeParams,
  LspInitializeResult,
  LspDiagnostic,
  LspHoverResult,
  LspDefinitionResult,
  LspSymbolResult,
  LspDiagnosticEvent,
  LspServerConfig,
} from "./lsp-client.js";

export {
  OAuthManager,
  generatePkcePair,
  buildAuthorizeUrl,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  saveTokenBundle,
  loadTokenBundle,
  isTokenExpired,
  generateState,
  validateState,
  getDefaultTokenStoragePath,
  generateEncryptionKey,
} from "./oauth-manager.js";
export type {
  PkcePair,
  TokenBundle,
  OAuthConfig,
} from "./oauth-manager.js";

export {
  mergeFlags,
  envOverridePrefix,
  mergeFlagSources,
  hashUserForBucketing,
  isInBucket,
  parseEnvValue,
  createDefaultFlags,
  validateFlagValue,
  FlagRegistry,
  RemoteFlagSource,
  UserSettingsFlagSource,
  EnvFlagSource,
  DEFAULT_FLAG_DEFINITIONS,
} from "./feature-flags.js";
export type {
  FlagValue,
  FlagMap,
  FlagDefinition,
  FlagSource,
  EffectiveFlags,
} from "./feature-flags.js";
