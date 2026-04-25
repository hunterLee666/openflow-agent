import { createHmac, createPublicKey, createVerify } from 'node:crypto';
import { RpcErrorCode, type RpcError } from './protocol.js';

export interface JwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface JwtVerifyOptions {
  audience?: string;
  issuer?: string;
  algorithms?: string[];
  clockTolerance?: number;
  maxTokenAge?: number;
}

export interface JwtVerifyResult {
  ok: true;
  claims: JwtClaims;
} | {
  ok: false;
  reason: string;
  code: number;
}

export interface JwtSignOptions {
  algorithm?: 'HS256' | 'HS384' | 'HS512';
  expiresIn?: number;
  notBefore?: number;
  issuer?: string;
  audience?: string;
  subject?: string;
  jwtid?: string;
}

const ALLOWED_ALGORITHMS = ['HS256', 'HS384', 'HS512', 'RS256', 'ES256'];

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    .toString('utf-8');
}

export function signJwt(
  payload: Partial<JwtClaims>,
  secretOrKey: string,
  options: JwtSignOptions = {}
): string {
  const now = Math.floor(Date.now() / 1000);
  const algorithm = options.algorithm || 'HS256';

  const header = {
    alg: algorithm,
    typ: 'JWT',
    kid: options.jwtid || undefined,
  };

  const claims: JwtClaims = {
    ...payload,
    iat: payload.iat ?? now,
    exp: options.expiresIn ? now + options.expiresIn : payload.exp,
    nbf: options.notBefore ? now + options.notBefore : payload.nbf,
    iss: options.issuer ?? payload.iss,
    aud: options.audience ?? payload.aud,
    sub: options.subject ?? payload.sub,
    jti: options.jwtid ?? payload.jti ?? crypto.randomUUID(),
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;

  let signature: string;
  if (algorithm.startsWith('HS')) {
    signature = createHmac(algorithm.toLowerCase(), secretOrKey)
      .update(signingInput)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  } else {
    throw new Error(`Asymmetric signing not implemented: ${algorithm}`);
  }

  return `${signingInput}.${signature}`;
}

export function verifyJwt(
  token: string,
  secretOrKey: string,
  options: JwtVerifyOptions = {}
): JwtVerifyResult {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { ok: false, reason: 'invalid token format', code: RpcErrorCode.AUTH_INVALID_SIGNATURE };
    }

    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;

    const header = JSON.parse(base64UrlDecode(headerEncoded)) as { alg: string; typ: string; kid?: string };

    if (!header.alg || !ALLOWED_ALGORITHMS.includes(header.alg)) {
      return { ok: false, reason: `disallowed algorithm: ${header.alg}`, code: RpcErrorCode.AUTH_INVALID_SIGNATURE };
    }

    if (header.alg === 'none') {
      return { ok: false, reason: 'none algorithm not allowed', code: RpcErrorCode.AUTH_INVALID_SIGNATURE };
    }

    const signingInput = `${headerEncoded}.${payloadEncoded}`;

    let isValid = false;
    if (header.alg.startsWith('HS')) {
      const expectedSignature = createHmac(header.alg.toLowerCase(), secretOrKey)
        .update(signingInput)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      isValid = signatureEncoded === expectedSignature;
    } else {
      return { ok: false, reason: `algorithm ${header.alg} not implemented`, code: RpcErrorCode.AUTH_INVALID_SIGNATURE };
    }

    if (!isValid) {
      return { ok: false, reason: 'invalid signature', code: RpcErrorCode.AUTH_INVALID_SIGNATURE };
    }

    const claims = JSON.parse(base64UrlDecode(payloadEncoded)) as JwtClaims;

    const now = Math.floor(Date.now() / 1000);
    const clockTolerance = options.clockTolerance ?? 0;

    if (claims.exp && now > claims.exp + clockTolerance) {
      return { ok: false, reason: 'token expired', code: RpcErrorCode.AUTH_EXPIRED };
    }

    if (claims.nbf && now < claims.nbf - clockTolerance) {
      return { ok: false, reason: 'token not yet valid', code: RpcErrorCode.AUTH_EXPIRED };
    }

    if (options.audience) {
      const aud = claims.aud;
      if (Array.isArray(aud)) {
        if (!aud.includes(options.audience)) {
          return { ok: false, reason: 'invalid audience', code: RpcErrorCode.AUTH_INVALID_AUDIENCE };
        }
      } else if (aud !== options.audience) {
        return { ok: false, reason: 'invalid audience', code: RpcErrorCode.AUTH_INVALID_AUDIENCE };
      }
    }

    if (options.issuer && claims.iss !== options.issuer) {
      return { ok: false, reason: 'invalid issuer', code: RpcErrorCode.AUTH_INVALID_SIGNATURE };
    }

    if (options.maxTokenAge && claims.iat) {
      const age = now - claims.iat;
      if (age > options.maxTokenAge) {
        return { ok: false, reason: 'token too old', code: RpcErrorCode.AUTH_EXPIRED };
      }
    }

    return { ok: true, claims };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
      code: RpcErrorCode.AUTH_INVALID_SIGNATURE,
    };
  }
}

export function decodeJwtPayload(token: string): JwtClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlDecode(parts[1])) as JwtClaims;
  } catch {
    return null;
  }
}

export interface JwtKeyRotationConfig {
  keys: Array<{ kid: string; secret: string; createdAt: number }>;
  maxKeyAgeMs: number;
  gracePeriodMs: number;
}

export class JwtKeyRotator {
  private config: JwtKeyRotationConfig;

  constructor(config: Partial<JwtKeyRotationConfig> = {}) {
    this.config = {
      keys: config.keys ?? [],
      maxKeyAgeMs: config.maxKeyAgeMs ?? 7 * 24 * 60 * 60 * 1000,
      gracePeriodMs: config.gracePeriodMs ?? 24 * 60 * 60 * 1000,
    };
  }

  addKey(kid: string, secret: string): void {
    this.config.keys.push({ kid, secret, createdAt: Date.now() });
  }

  getActiveKey(): { kid: string; secret: string } | null {
    const now = Date.now();
    const validKeys = this.config.keys.filter(
      (k) => now - k.createdAt < this.config.maxKeyAgeMs
    );

    if (validKeys.length === 0) return null;

    const latest = validKeys.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    return { kid: latest.kid, secret: latest.secret };
  }

  verifyWithRotation(token: string, options: JwtVerifyOptions = {}): JwtVerifyResult {
    const now = Date.now();
    const validKeys = this.config.keys.filter(
      (k) => now - k.createdAt < this.config.maxKeyAgeMs + this.config.gracePeriodMs
    );

    for (const key of validKeys) {
      const result = verifyJwt(token, key.secret, options);
      if (result.ok) {
        return result;
      }
    }

    return {
      ok: false,
      reason: 'no valid key found for token',
      code: RpcErrorCode.AUTH_INVALID_SIGNATURE,
    };
  }

  rotateKey(): string {
    const kid = crypto.randomUUID();
    const secret = crypto.randomUUID();
    this.addKey(kid, secret);

    const now = Date.now();
    this.config.keys = this.config.keys.filter(
      (k) => now - k.createdAt < this.config.maxKeyAgeMs + this.config.gracePeriodMs
    );

    return kid;
  }

  getStats(): { totalKeys: number; activeKeys: number; oldestKeyAge: number } {
    const now = Date.now();
    const activeKeys = this.config.keys.filter(
      (k) => now - k.createdAt < this.config.maxKeyAgeMs
    );

    return {
      totalKeys: this.config.keys.length,
      activeKeys: activeKeys.length,
      oldestKeyAge: this.config.keys.length > 0
        ? now - Math.min(...this.config.keys.map((k) => k.createdAt))
        : 0,
    };
  }
}
