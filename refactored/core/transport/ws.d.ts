declare module "ws" {
  import { EventEmitter } from "events";
  import { Duplex } from "stream";

  class WebSocket extends EventEmitter {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;

    constructor(address: string | URL, options?: ClientOptions);

    readyState: number;
    send(data: string | Buffer | ArrayBuffer | Buffer[], options?: { binary?: boolean; mask?: boolean; compress?: boolean }, cb?: (err?: Error) => void): void;
    close(code?: number, data?: string | Buffer): void;
    terminate(): void;

    on(event: "open", listener: () => void): this;
    on(event: "message", listener: (data: Buffer, isBinary: boolean) => void): this;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "ping", listener: (data: Buffer) => void): this;
    on(event: "pong", listener: (data: Buffer) => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  }

  interface ClientOptions {
    protocol?: string;
    headers?: Record<string, string>;
    [key: string]: unknown;
  }

  export = WebSocket;
}
