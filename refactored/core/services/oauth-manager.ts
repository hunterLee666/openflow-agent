import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

export interface PkcePair {
  code_verifier: string;
  code_challenge: string;
}

export interface TokenBundle {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
  token_type?: string;
}

export interface OAuthConfig {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  tokenStoragePath?: string;
  encryptionKey?: Buffer;
}

export function generatePkcePair(): PkcePair {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(
    createHash("sha256").update(verifier).digest()
  );
  return { code_verifier: verifier, code_challenge: challenge };
}

export function buildAuthorizeUrl(opts: {
  base: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
}): string {
  const u = new URL("/oauth/authorize", opts.base);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("scope", opts.scope);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export async function exchangeCode(params: {
  tokenEndpoint: string;
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenBundle> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  });

  const res = await fetch(params.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };

  const now = Date.now();
  const expiresAt = now + (data.expires_in ?? 3600) * 1000;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    scope: data.scope,
    token_type: data.token_type,
  };
}

export async function refreshAccessToken(params: {
  tokenEndpoint: string;
  clientId: string;
  refreshToken: string;
  scope?: string;
}): Promise<TokenBundle> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });

  if (params.scope) {
    body.set("scope", params.scope);
  }

  const res = await fetch(params.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };

  const now = Date.now();
  const expiresAt = now + (data.expires_in ?? 3600) * 1000;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? params.refreshToken,
    expires_at: expiresAt,
    scope: data.scope,
    token_type: data.token_type,
  };
}

export async function revokeToken(params: {
  revocationEndpoint: string;
  clientId: string;
  token: string;
}): Promise<void> {
  const body = new URLSearchParams({
    token: params.token,
    client_id: params.clientId,
  });

  const res = await fetch(params.revocationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Token revocation failed: ${res.status}`);
  }
}

export async function saveTokenBundle(
  filePath: string,
  bundle: TokenBundle,
  key: Buffer
): Promise<void> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const pt = Buffer.from(JSON.stringify(bundle), "utf8");
  const enc = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    enc: enc.toString("base64"),
  };

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload), { mode: 0o600 });
}

export async function loadTokenBundle(
  filePath: string,
  key: Buffer
): Promise<TokenBundle | null> {
  if (!existsSync(filePath)) return null;

  try {
    const raw = await readFile(filePath, "utf8");
    const payload = JSON.parse(raw) as {
      iv: string;
      tag: string;
      enc: string;
    };

    const iv = Buffer.from(payload.iv, "base64");
    const tag = Buffer.from(payload.tag, "base64");
    const enc = Buffer.from(payload.enc, "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as TokenBundle;
  } catch {
    return null;
  }
}

export function isTokenExpired(bundle: TokenBundle, bufferMs = 300000): boolean {
  return Date.now() + bufferMs >= bundle.expires_at;
}

export function generateState(): string {
  return randomBytes(16).toString("hex");
}

export function validateState(expected: string, actual: string): boolean {
  return expected === actual;
}

export function getDefaultTokenStoragePath(): string {
  return join(homedir(), ".openflow", "oauth", "tokens.json.enc");
}

export function generateEncryptionKey(): Buffer {
  return randomBytes(32);
}

export class OAuthManager {
  private config: OAuthConfig;
  private currentToken: TokenBundle | null = null;
  private state: string | null = null;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  async startAuth(): Promise<{ authorizeUrl: string; state: string }> {
    const pkce = generatePkcePair();
    this.state = generateState();

    const authorizeUrl = buildAuthorizeUrl({
      base: this.config.authorizationEndpoint,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      scope: this.config.scope,
      state: this.state,
      codeChallenge: pkce.code_challenge,
    });

    return { authorizeUrl, state: this.state };
  }

  async handleCallback(code: string, returnedState: string): Promise<TokenBundle> {
    if (!this.state) {
      throw new Error("No OAuth flow in progress");
    }

    if (!validateState(this.state, returnedState)) {
      throw new Error("State mismatch - possible CSRF");
    }

    const bundle = await exchangeCode({
      tokenEndpoint: this.config.tokenEndpoint,
      clientId: this.config.clientId,
      code,
      redirectUri: this.config.redirectUri,
      codeVerifier: this.state,
    });

    this.currentToken = bundle;
    await this.persistToken(bundle);
    return bundle;
  }

  async getAccessToken(): Promise<string> {
    if (!this.currentToken || isTokenExpired(this.currentToken)) {
      await this.refreshIfNeeded();
    }

    if (!this.currentToken) {
      throw new Error("No access token available");
    }

    return this.currentToken.access_token;
  }

  async refreshIfNeeded(): Promise<void> {
    if (!this.currentToken?.refresh_token) {
      throw new Error("No refresh token available - re-authentication required");
    }

    try {
      const newBundle = await refreshAccessToken({
        tokenEndpoint: this.config.tokenEndpoint,
        clientId: this.config.clientId,
        refreshToken: this.currentToken.refresh_token,
        scope: this.config.scope,
      });

      this.currentToken = newBundle;
      await this.persistToken(newBundle);
    } catch (e) {
      this.currentToken = null;
      throw e;
    }
  }

  async revoke(): Promise<void> {
    if (!this.currentToken) return;

    try {
      await revokeToken({
        revocationEndpoint: this.config.tokenEndpoint.replace("/token", "/revoke"),
        clientId: this.config.clientId,
        token: this.currentToken.refresh_token ?? this.currentToken.access_token,
      });
    } finally {
      this.currentToken = null;
    }
  }

  async loadPersistedToken(): Promise<boolean> {
    const path = this.config.tokenStoragePath ?? getDefaultTokenStoragePath();
    const key = this.config.encryptionKey ?? generateEncryptionKey();

    const bundle = await loadTokenBundle(path, key);
    if (bundle) {
      this.currentToken = bundle;
      return true;
    }

    return false;
  }

  private async persistToken(bundle: TokenBundle): Promise<void> {
    const path = this.config.tokenStoragePath ?? getDefaultTokenStoragePath();
    const key = this.config.encryptionKey ?? generateEncryptionKey();
    await saveTokenBundle(path, bundle, key);
  }
}

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
