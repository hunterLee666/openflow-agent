export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface AuthState {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export interface AuthCallbacks {
  onTokenReceived?: (tokens: TokenResponse) => void;
  onError?: (error: Error) => void;
  onAuthRequired?: () => void;
}

export interface AuthorizationRequest {
  responseType: 'code';
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface TokenRequest {
  grantType: 'authorization_code' | 'refresh_token';
  code?: string;
  redirectUri?: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier?: string;
  refreshToken?: string;
}

export interface RevocationRequest {
  token: string;
  tokenTypeHint?: 'access_token' | 'refresh_token';
  clientId: string;
  clientSecret?: string;
}

export interface TokenManagerConfig {
  oauth: OAuthConfig;
  storageKey?: string;
  autoRefresh?: boolean;
  refreshThreshold?: number;
}

export interface UserInfo {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}