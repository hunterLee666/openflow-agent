import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { homedir } from 'node:os'

export interface TokenBundle {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  tokenType?: string
  scope?: string
  createdAt: number
}

export interface EncryptedPayload {
  iv: string
  tag: string
  enc: string
  version: number
}

export interface SecureTokenStorage {
  save(key: string, bundle: TokenBundle): Promise<void>
  load(key: string): Promise<TokenBundle | null>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const TAG_LENGTH = 16
const CURRENT_VERSION = 1

export class EncryptedTokenStorage implements SecureTokenStorage {
  private storagePath: string
  private encryptionKey: Buffer | null = null

  constructor(storagePath?: string) {
    this.storagePath = storagePath || path.join(homedir(), '.agent', 'tokens')
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.storagePath, { recursive: true })
    this.encryptionKey = await this.getOrCreateKey()
  }

  async save(key: string, bundle: TokenBundle): Promise<void> {
    if (!this.encryptionKey) {
      await this.initialize()
    }

    const filePath = this.getFilePath(key)
    const payload = await this.encrypt(bundle)

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(payload), {
      mode: 0o600,
      encoding: 'utf8',
    })
  }

  async load(key: string): Promise<TokenBundle | null> {
    if (!this.encryptionKey) {
      await this.initialize()
    }

    const filePath = this.getFilePath(key)

    try {
      const data = await fs.readFile(filePath, 'utf8')
      const payload = JSON.parse(data) as EncryptedPayload
      return await this.decrypt(payload)
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key)
    try {
      await fs.unlink(filePath)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key)
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private getFilePath(key: string): string {
    const hashedKey = crypto
      .createHash('sha256')
      .update(key)
      .digest('hex')
      .slice(0, 32)
    return path.join(this.storagePath, `${hashedKey}.token`)
  }

  private async getOrCreateKey(): Promise<Buffer> {
    const keyPath = path.join(this.storagePath, '.key')

    try {
      const existingKey = await fs.readFile(keyPath)
      if (existingKey.length === KEY_LENGTH) {
        return existingKey
      }
    } catch {
      // Key doesn't exist, create new one
    }

    const newKey = crypto.randomBytes(KEY_LENGTH)
    await fs.mkdir(this.storagePath, { recursive: true })
    await fs.writeFile(keyPath, newKey, { mode: 0o400 })

    return newKey
  }

  private async encrypt(bundle: TokenBundle): Promise<EncryptedPayload> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized')
    }

    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv)

    const plaintext = Buffer.from(JSON.stringify(bundle), 'utf8')
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const tag = cipher.getAuthTag()

    return {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      enc: encrypted.toString('base64'),
      version: CURRENT_VERSION,
    }
  }

  private async decrypt(payload: EncryptedPayload): Promise<TokenBundle> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized')
    }

    if (payload.version !== CURRENT_VERSION) {
      throw new Error(`Unsupported token version: ${payload.version}`)
    }

    const iv = Buffer.from(payload.iv, 'base64')
    const tag = Buffer.from(payload.tag, 'base64')
    const encrypted = Buffer.from(payload.enc, 'base64')

    const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv)
    decipher.setAuthTag(tag)

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])

    return JSON.parse(decrypted.toString('utf8')) as TokenBundle
  }
}

export class InMemoryTokenStorage implements SecureTokenStorage {
  private store: Map<string, TokenBundle> = new Map()

  async save(key: string, bundle: TokenBundle): Promise<void> {
    this.store.set(key, bundle)
  }

  async load(key: string): Promise<TokenBundle | null> {
    return this.store.get(key) || null
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key)
  }
}

export class TokenManager {
  private storage: SecureTokenStorage
  private refreshBufferMs: number

  constructor(storage?: SecureTokenStorage, refreshBufferMs: number = 300000) {
    this.storage = storage || new InMemoryTokenStorage()
    this.refreshBufferMs = refreshBufferMs
  }

  async getToken(key: string): Promise<string | null> {
    const bundle = await this.storage.load(key)
    if (!bundle) return null

    if (this.checkExpired(bundle)) {
      return null
    }

    return bundle.accessToken
  }

  async getRefreshToken(key: string): Promise<string | null> {
    const bundle = await this.storage.load(key)
    return bundle?.refreshToken || null
  }

  async setToken(
    key: string,
    accessToken: string,
    refreshToken?: string,
    expiresIn?: number,
  ): Promise<void> {
    const bundle: TokenBundle = {
      accessToken,
      refreshToken,
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
      createdAt: Date.now(),
    }

    await this.storage.save(key, bundle)
  }

  async needsRefresh(key: string): Promise<boolean> {
    const bundle = await this.storage.load(key)
    if (!bundle || !bundle.refreshToken) return false
    if (!bundle.expiresAt) return false

    return Date.now() + this.refreshBufferMs >= bundle.expiresAt
  }

  async isTokenExpired(key: string): Promise<boolean> {
    const bundle = await this.storage.load(key)
    if (!bundle) return true
    return this.checkExpired(bundle)
  }

  async deleteToken(key: string): Promise<void> {
    await this.storage.delete(key)
  }

  private checkExpired(bundle: TokenBundle): boolean {
    if (!bundle.expiresAt) return false
    return Date.now() >= bundle.expiresAt
  }
}

let tokenStorage: SecureTokenStorage | null = null
let tokenManager: TokenManager | null = null

export function getTokenStorage(): SecureTokenStorage {
  if (!tokenStorage) {
    tokenStorage = new EncryptedTokenStorage()
  }
  return tokenStorage
}

export function getTokenManager(): TokenManager {
  if (!tokenManager) {
    tokenManager = new TokenManager(getTokenStorage())
  }
  return tokenManager
}

export function resetTokenStorage(): void {
  tokenStorage = null
  tokenManager = null
}
