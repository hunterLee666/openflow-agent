import type {
  AuthCallbacks,
  AuthState,
  AuthorizationRequest,
  PKCEChallenge,
  TokenManagerConfig,
  TokenRequest,
  TokenResponse,
  UserInfo,
} from './types';
import { MemoryStorage, FileStorage, createPersistentStorage } from './storage';

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

async function sha256Base64Url(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function generatePKCEChallenge(): Promise<PKCEChallenge> {
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

export function buildAuthorizationUrl(request: AuthorizationRequest): string {
  const params = new URLSearchParams({
    response_type: request.responseType,
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    scope: request.scope,
    state: request.state,
    code_challenge: request.codeChallenge,
    code_challenge_method: request.codeChallengeMethod,
  });
  return `${request.redirectUri.includes('?') ? '' : '?'}${params.toString()}`;
}

export function generateState(): string {
  return generateRandomString(32);
}

export class OAuthTokenManager {
  private readonly config: TokenManagerConfig;
  private state: AuthState = {};
  private callbacks: AuthCallbacks = {};
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private sessionStorage = new MemoryStorage();
  private persistentStorage: FileStorage;

  constructor(config: TokenManagerConfig, callbacks?: AuthCallbacks) {
    this.config = config;
    this.callbacks = callbacks || {};
    this.persistentStorage = new FileStorage(
      config.storageKey ? `${process.env.HOME || '.'}/.openflow/${config.storageKey}` : `${process.env.HOME || '.'}/.openflow/auth.json`
    );
    this.loadState();
  }

  private loadState(): void {
    try {
      const stored = this.persistentStorage.getItem('oauth_state');
      if (stored) {
        const parsed = JSON.parse(stored) as AuthState;
        if (parsed.expiresAt) {
          parsed.expiresAt = new Date(parsed.expiresAt);
        }
        this.state = parsed;
      }
    } catch {
      this.state = {};
    }
  }

  private saveState(): void {
    try {
      this.persistentStorage.setItem('oauth_state', JSON.stringify(this.state));
    } catch (error) {
      this.callbacks.onError?.(error as Error);
    }
  }

  async getAuthorizationUrl(): Promise<string> {
    const pkce = await generatePKCEChallenge();
    const state = generateState();

    this.sessionStorage.setItem('pkce_verifier', pkce.codeVerifier);
    this.sessionStorage.setItem('oauth_state', state);

    const request: AuthorizationRequest = {
      responseType: 'code',
      clientId: this.config.oauth.clientId,
      redirectUri: this.config.oauth.redirectUri,
      scope: this.config.oauth.scopes.join(' '),
      state,
      codeChallenge: pkce.codeChallenge,
      codeChallengeMethod: pkce.codeChallengeMethod,
    };

    return buildAuthorizationUrl(request);
  }

  async handleCallback(code: string, state: string): Promise<TokenResponse> {
    const savedState = this.sessionStorage.getItem('oauth_state');
    const codeVerifier = this.sessionStorage.getItem('pkce_verifier');

    if (state !== savedState) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    if (!codeVerifier) {
      throw new Error('PKCE code verifier not found');
    }

    const request: TokenRequest = {
      grantType: 'authorization_code',
      code,
      redirectUri: this.config.oauth.redirectUri,
      clientId: this.config.oauth.clientId,
      clientSecret: this.config.oauth.clientSecret,
      codeVerifier,
    };

    const tokens = await this.exchangeCodeForToken(request);

    this.sessionStorage.removeItem('pkce_verifier');
    this.sessionStorage.removeItem('oauth_state');

    return tokens;
  }

  private async exchangeCodeForToken(request: TokenRequest): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: request.grantType,
      code: request.code || '',
      redirect_uri: request.redirectUri || '',
      client_id: request.clientId,
      ...(request.clientSecret && { client_secret: request.clientSecret }),
      ...(request.codeVerifier && { code_verifier: request.codeVerifier }),
    });

    const response = await fetch(this.config.oauth.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error((errorData.error_description as string) || (errorData.error as string) || 'Token exchange failed');
    }

    const tokens = await response.json() as TokenResponse;
    this.setTokens(tokens);
    return tokens;
  }

  async refreshAccessToken(): Promise<TokenResponse> {
    if (!this.state.refreshToken) {
      throw new Error('No refresh token available');
    }

    const request: TokenRequest = {
      grantType: 'refresh_token',
      clientId: this.config.oauth.clientId,
      clientSecret: this.config.oauth.clientSecret,
      refreshToken: this.state.refreshToken,
    };

    const tokens = await this.refreshToken(request);
    return tokens;
  }

  private async refreshToken(request: TokenRequest): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: request.grantType,
      refresh_token: request.refreshToken || '',
      client_id: request.clientId,
      ...(request.clientSecret && { client_secret: request.clientSecret }),
    });

    const response = await fetch(this.config.oauth.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error((errorData.error_description as string) || (errorData.error as string) || 'Token refresh failed');
    }

    const tokens = await response.json() as TokenResponse;
    this.setTokens(tokens);
    return tokens;
  }

  private setTokens(tokens: TokenResponse): void {
    this.state = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined,
      scope: tokens.scope,
    };
    this.saveState();
    this.callbacks.onTokenReceived?.(tokens);

    if (this.config.autoRefresh && this.state.expiresAt) {
      this.scheduleRefresh();
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.state.expiresAt || !this.config.autoRefresh) {
      return;
    }

    const refreshThreshold = this.config.refreshThreshold || 60000;
    const refreshTime = this.state.expiresAt.getTime() - Date.now() - refreshThreshold;

    if (refreshTime > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshAccessToken().catch(error => {
          this.callbacks.onError?.(error as Error);
          if (error instanceof Error && error.message.includes('No refresh token')) {
            this.callbacks.onAuthRequired?.();
          }
        });
      }, refreshTime);
    } else {
      this.callbacks.onAuthRequired?.();
    }
  }

  async revokeToken(token?: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void> {
    const tokenToRevoke = token || this.state.accessToken;

    if (!tokenToRevoke) {
      return;
    }

    const params = new URLSearchParams({
      token: tokenToRevoke,
      ...(tokenTypeHint && { token_type_hint: tokenTypeHint }),
      client_id: this.config.oauth.clientId,
      ...(this.config.oauth.clientSecret && { client_secret: this.config.oauth.clientSecret }),
    });

    try {
      await fetch(`${this.config.oauth.tokenUrl}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
    } catch {
    }

    this.clearState();
  }

  clearState(): void {
    this.state = {};
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.persistentStorage.removeItem('oauth_state');
  }

  getAccessToken(): string | undefined {
    return this.state.accessToken;
  }

  isAuthenticated(): boolean {
    if (!this.state.accessToken) {
      return false;
    }
    if (this.state.expiresAt && this.state.expiresAt <= new Date()) {
      return false;
    }
    return true;
  }

  getState(): AuthState {
    return { ...this.state };
  }

  async getUserInfo(): Promise<UserInfo> {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${this.config.oauth.authorizationUrl}/userinfo`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    return response.json() as Promise<UserInfo>;
  }
}

export function createOAuthManager(config: TokenManagerConfig, callbacks?: AuthCallbacks): OAuthTokenManager {
  return new OAuthTokenManager(config, callbacks);
}