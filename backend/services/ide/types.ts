export type IDEType = 'vscode' | 'cursor' | 'jetbrains';

export interface IDEConfig {
  type: IDEType;
  extensionPath?: string;
  port?: number;
  enableNotifications?: boolean;
}

export interface IDEClient {
  getIDE(): IDEType;
  isAvailable(): Promise<boolean>;
  openFile(path: string, options?: OpenFileOptions): Promise<void>;
  openTerminal(command: string): Promise<void>;
  showNotification(message: string, type: 'info' | 'warning' | 'error'): Promise<void>;
  getWorkspaceFolder(): Promise<string | undefined>;
  executeCommand(command: string, args?: unknown[]): Promise<unknown>;
  onDidChangeActiveTextEditor(callback: (event: TextEditorEvent) => void): void;
  onDidChangeVisibleTextEditors(callback: (event: TextEditorEvent[]) => void): void;
  dispose(): void;
}

export interface OpenFileOptions {
  line?: number;
  column?: number;
  preserveFocus?: boolean;
  preview?: boolean;
}

export interface TextEditorEvent {
  fileName: string;
  path: string;
  isActive: boolean;
}

export interface EditorPosition {
  line: number;
  column: number;
}

export interface EditorRange {
  start: EditorPosition;
  end: EditorPosition;
}

export interface Diagnostic {
  message: string;
  severity: 'error' | 'warning' | 'info';
  range?: EditorRange;
  code?: string | number;
  source?: string;
}

export interface CompletionItem {
  label: string;
  kind: 'method' | 'function' | 'variable' | 'property' | 'keyword' | 'text';
  detail?: string;
  documentation?: string;
  insertText?: string;
  range?: EditorRange;
}

export interface HoverInfo {
  contents: string | string[];
  range?: EditorRange;
}

export interface DefinitionLocation {
  uri: string;
  range: EditorRange;
}

export interface ImplementationLocation {
  uri: string;
  range: EditorRange;
}

export interface ReferenceLocation {
  uri: string;
  range: EditorRange;
}

export interface IDEServices {
  languageClient?: LanguageClientProxy;
  debugClient?: DebugClientProxy;
  terminalClient?: TerminalClientProxy;
  fileSystemClient?: FileSystemClientProxy;
}

export interface LanguageClientProxy {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  sendNotification(method: string, params?: unknown): void;
  sendRequest<T>(method: string, params?: unknown): Promise<T>;
  onNotification(method: string, handler: (params: unknown) => void): void;
}

export interface DebugClientProxy {
  initialize(): Promise<void>;
  startDebugging(config: DebugConfiguration): Promise<void>;
  stopDebugging(): Promise<void>;
  setBreakpoints(file: string, breakpoints: number[]): Promise<void>;
  evaluate(expression: string): Promise<string>;
}

export interface DebugConfiguration {
  name: string;
  type: string;
  request: string;
  program?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface TerminalClientProxy {
  createTerminal(name: string): Promise<void>;
  sendText(text: string): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface FileSystemClientProxy {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<DirectoryEntry[]>;
}

export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
}

export interface IDEProtocolMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}
