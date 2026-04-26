declare module "better-sqlite3" {
  interface Statement {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
  }

  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): void;
    close(): void;
    transaction<T>(fn: () => T): () => T;
  }

  const Database: new (path: string) => Database;
  export default Database;
}

declare module "node-telegram-bot-api" {
  import { EventEmitter } from "events";

  interface Options {
    polling?: boolean | PollingOptions;
    webHook?: any;
    onlyFirstMatch?: boolean;
    request?: any;
  }

  interface PollingOptions {
    interval?: number;
    timeout?: number;
    params?: any;
  }

  interface Message {
    chat: { id: number };
    from: { id: number; username?: string; first_name?: string };
    text?: string;
    date: number;
  }

  interface User {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  }

  interface Chat {
    id: number;
    type: string;
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  }

  class TelegramBot extends EventEmitter {
    constructor(token: string, options?: Options);
    sendMessage(chatId: number | string, text: string, options?: any): Promise<Message>;
    on(event: string, listener: (...args: any[]) => void): this;
    on(event: "message", listener: (message: Message) => void): this;
    on(event: "polling_error", listener: (error: Error) => void): this;
    startPolling(): Promise<void>;
    stopPolling(): Promise<void>;
    getMe(): Promise<User>;
    getChat(chatId: number | string): Promise<Chat>;
    getChatMember(chatId: number | string, userId: number): Promise<any>;
  }

  export default TelegramBot;
}
