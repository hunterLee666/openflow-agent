import type {
  CompletionItem,
  DefinitionLocation,
  Diagnostic,
  EditorRange,
  HoverInfo,
  IDEClient,
  IDEConfig,
  IDEServices,
  IDEType,
  LanguageClientProxy,
  OpenFileOptions,
  TextEditorEvent,
} from './types.js';
import { EventEmitter } from 'events';

declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void; getState?: () => unknown; setState?: (state: unknown) => void };
declare function acquireCursorApi(): unknown;

export abstract class BaseIDEClient implements IDEClient {
  protected config: IDEConfig;
  protected services: IDEServices = {};
  protected eventEmitter = new EventEmitter();
  protected available = false;

  constructor(config: IDEConfig) {
    this.config = config;
  }

  abstract getIDE(): IDEType;
  abstract isAvailable(): Promise<boolean>;
  abstract openFile(path: string, options?: OpenFileOptions): Promise<void>;
  abstract openTerminal(command: string): Promise<void>;
  abstract showNotification(message: string, type: 'info' | 'warning' | 'error'): Promise<void>;
  abstract getWorkspaceFolder(): Promise<string | undefined>;
  abstract executeCommand(command: string, args?: unknown[]): Promise<unknown>;

  onDidChangeActiveTextEditor(callback: (event: TextEditorEvent) => void): void {
    this.eventEmitter.on('activeTextEditorChange', callback);
  }

  onDidChangeVisibleTextEditors(callback: (event: TextEditorEvent[]) => void): void {
    this.eventEmitter.on('visibleTextEditorsChange', callback);
  }

  dispose(): void {
    this.eventEmitter.removeAllListeners();
    this.services = {};
  }

  protected emitActiveEditorChange(event: TextEditorEvent): void {
    this.eventEmitter.emit('activeTextEditorChange', event);
  }

  protected emitVisibleEditorsChange(events: TextEditorEvent[]): void {
    this.eventEmitter.emit('visibleTextEditorsChange', events);
  }
}

export class VSCodeClient extends BaseIDEClient {
  private vscode?: ReturnType<typeof acquireVsCodeApi>;

  constructor(config: IDEConfig) {
    super(config);
    this.tryLoadVSCodeAPI();
  }

  private tryLoadVSCodeAPI(): void {
    try {
      if (typeof acquireVsCodeApi !== 'undefined') {
        this.vscode = acquireVsCodeApi();
        this.available = true;
      }
    } catch {
      this.available = false;
    }
  }

  getIDE(): IDEType {
    return 'vscode';
  }

  async isAvailable(): Promise<boolean> {
    return this.available && this.vscode !== undefined;
  }

  async openFile(path: string, options?: OpenFileOptions): Promise<void> {
    if (!this.vscode) {
      throw new Error('VSCode API not available');
    }

    console.log(`[VSCode] Opening file: ${path}`);
  }

  async openTerminal(command: string): Promise<void> {
    if (!this.vscode) {
      throw new Error('VSCode API not available');
    }

    console.log(`[VSCode] Opening terminal: ${command}`);
  }

  async showNotification(message: string, type: 'info' | 'warning' | 'error'): Promise<void> {
    if (!this.vscode) {
      console.log(`[${type}] ${message}`);
      return;
    }

    console.log(`[VSCode][${type}] ${message}`);
  }

  async getWorkspaceFolder(): Promise<string | undefined> {
    if (!this.vscode) {
      return undefined;
    }

    return process.cwd();
  }

  async executeCommand(command: string, args?: unknown[]): Promise<unknown> {
    if (!this.vscode) {
      throw new Error('VSCode API not available');
    }

    console.log(`[VSCode] Executing command: ${command}`);
    return undefined;
  }

  async provideCompletionItems(fileName: string, position: EditorRange): Promise<CompletionItem[]> {
    if (!this.vscode) {
      return [];
    }

    return [];
  }

  async provideHover(fileName: string, position: EditorRange): Promise<HoverInfo | null> {
    if (!this.vscode) {
      return null;
    }

    return null;
  }

  async provideDefinition(fileName: string, position: EditorRange): Promise<DefinitionLocation | null> {
    if (!this.vscode) {
      return null;
    }

    return null;
  }
}

export class CursorClient extends BaseIDEClient {
  private cursor?: unknown;

  constructor(config: IDEConfig) {
    super(config);
    this.tryLoadCursorAPI();
  }

  private tryLoadCursorAPI(): void {
    try {
      if (typeof acquireCursorApi !== 'undefined') {
        this.cursor = acquireCursorApi();
        this.available = true;
      } else if (typeof acquireVsCodeApi !== 'undefined') {
        this.cursor = acquireVsCodeApi();
        this.available = true;
      }
    } catch {
      this.available = false;
    }
  }

  getIDE(): IDEType {
    return 'cursor';
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async openFile(path: string, options?: OpenFileOptions): Promise<void> {
    console.log(`[Cursor] Opening file: ${path}`);
  }

  async openTerminal(command: string): Promise<void> {
    console.log(`[Cursor] Opening terminal: ${command}`);
  }

  async showNotification(message: string, type: 'info' | 'warning' | 'error'): Promise<void> {
    console.log(`[Cursor][${type}] ${message}`);
  }

  async getWorkspaceFolder(): Promise<string | undefined> {
    return process.cwd();
  }

  async executeCommand(command: string, args?: unknown[]): Promise<unknown> {
    console.log(`[Cursor] Executing command: ${command}`);
    return undefined;
  }
}

export class JetBrainsClient extends BaseIDEClient {
  private pyCharm?: unknown;

  constructor(config: IDEConfig) {
    super(config);
    this.tryLoadJetBrainsAPI();
  }

  private tryLoadJetBrainsAPI(): void {
    try {
      const globalWithJetBrains = globalThis as unknown as { JetBrains?: unknown };
      if (typeof globalWithJetBrains.JetBrains !== 'undefined') {
        this.pyCharm = globalWithJetBrains.JetBrains;
        this.available = true;
      }
    } catch {
      this.available = false;
    }
  }

  getIDE(): IDEType {
    return 'jetbrains';
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async openFile(path: string, options?: OpenFileOptions): Promise<void> {
    console.log(`[JetBrains] Opening file: ${path}`);
  }

  async openTerminal(command: string): Promise<void> {
    console.log(`[JetBrains] Opening terminal: ${command}`);
  }

  async showNotification(message: string, type: 'info' | 'warning' | 'error'): Promise<void> {
    console.log(`[JetBrains][${type}] ${message}`);
  }

  async getWorkspaceFolder(): Promise<string | undefined> {
    return process.cwd();
  }

  async executeCommand(command: string, args?: unknown[]): Promise<unknown> {
    console.log(`[JetBrains] Executing command: ${command}`);
    return undefined;
  }
}

export function createIDEClient(config: IDEConfig): IDEClient {
  switch (config.type) {
    case 'vscode':
      return new VSCodeClient(config);
    case 'cursor':
      return new CursorClient(config);
    case 'jetbrains':
      return new JetBrainsClient(config);
    default:
      throw new Error(`Unsupported IDE type: ${config.type}`);
  }
}

export function detectIDE(): IDEType | undefined {
  if (typeof acquireVsCodeApi !== 'undefined') {
    return 'vscode';
  }
  if (typeof acquireCursorApi !== 'undefined') {
    return 'cursor';
  }
  const globalWithJetBrains = globalThis as unknown as { JetBrains?: unknown };
  if (typeof globalWithJetBrains.JetBrains !== 'undefined') {
    return 'jetbrains';
  }
  return undefined;
}

export async function createAutoDetectClient(): Promise<IDEClient | undefined> {
  const detected = detectIDE();
  if (detected) {
    return createIDEClient({ type: detected });
  }
  return undefined;
}
