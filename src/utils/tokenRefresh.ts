export interface TokenRefreshConfig {
  refreshBeforeExpiryMs: number;
  defaultExpiryMs: number;
}

export const DEFAULT_TOKEN_REFRESH_CONFIG: TokenRefreshConfig = {
  refreshBeforeExpiryMs: 5 * 60 * 1000,
  defaultExpiryMs: 4 * 60 * 60 * 1000,
};

export interface ScheduledRefresh {
  sessionId: string;
  scheduledTime: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface TokenRefreshHandler {
  onRefresh: (sessionId: string, newToken: string) => void;
}

export class TokenRefreshScheduler {
  private schedules = new Map<string, ScheduledRefresh>();
  private config: TokenRefreshConfig;
  private getAccessToken?: () => string | undefined | Promise<string | undefined>;
  private label: string;

  constructor(
    config: Partial<TokenRefreshConfig> = {},
    getAccessToken?: () => string | undefined | Promise<string | undefined>,
    label = 'default'
  ) {
    this.config = { ...DEFAULT_TOKEN_REFRESH_CONFIG, ...config };
    this.getAccessToken = getAccessToken;
    this.label = label;
  }

  schedule(sessionId: string, token: string, expiryMs?: number): void {
    this.cancel(sessionId);

    const tokenExpiry = expiryMs || this.config.defaultExpiryMs;
    const refreshTime = tokenExpiry - this.config.refreshBeforeExpiryMs;

    if (refreshTime <= 0) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const newToken = await this.getAccessToken?.();
        if (newToken) {
          this.schedules.get(sessionId)?.timer;
          const handler = this as unknown as TokenRefreshHandler;
          handler.onRefresh(sessionId, newToken);
        }
      } catch (error) {
        console.error(`[TokenRefresh:${this.label}] Refresh failed for ${sessionId}:`, error);
      }
    }, refreshTime);

    this.schedules.set(sessionId, {
      sessionId,
      scheduledTime: Date.now() + refreshTime,
      timer,
    });
  }

  cancel(sessionId: string): boolean {
    const scheduled = this.schedules.get(sessionId);
    if (scheduled) {
      clearTimeout(scheduled.timer);
      this.schedules.delete(sessionId);
      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const scheduled of this.schedules.values()) {
      clearTimeout(scheduled.timer);
    }
    this.schedules.clear();
  }

  getScheduledTime(sessionId: string): number | null {
    return this.schedules.get(sessionId)?.scheduledTime ?? null;
  }

  getPendingCount(): number {
    return this.schedules.size;
  }

  listPending(): string[] {
    return Array.from(this.schedules.keys());
  }
}
