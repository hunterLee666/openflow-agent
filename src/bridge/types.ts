export interface BridgeServer {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (msg: BridgeMessage) => void): void;
  send(msg: BridgeMessage): void;
}

export interface BridgeClient {
  connect(url: string, token: string): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (msg: BridgeMessage) => void): void;
  send(msg: BridgeMessage): void;
}

export interface BridgeMessage {
  id: string;
  method: string;
  params: unknown;
  timestamp: number;
}

export interface IdeCapabilities {
  supportsInlineEdit: boolean;
  supportsDiffView: boolean;
  supportsTerminal: boolean;
  supportsFileWatcher: boolean;
}

export interface IdeState {
  currentFile?: string;
  cursorPosition?: { line: number; character: number };
  selectedText?: string;
  openFiles: string[];
}
