import { spawn, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { z } from "zod";

export const LspCapabilitiesSchema = z.object({
  textDocumentSync: z.union([z.number(), z.object({ save: z.boolean().optional(), change: z.number().optional() })]).optional(),
  completionProvider: z.object({ resolveProvider: z.boolean().optional(), triggerCharacters: z.array(z.string()).optional() }).optional(),
  hoverProvider: z.boolean().optional(),
  definitionProvider: z.boolean().optional(),
  referencesProvider: z.boolean().optional(),
  documentSymbolProvider: z.boolean().optional(),
  workspaceSymbolProvider: z.boolean().optional(),
  publishDiagnostics: z.boolean().optional(),
});

export type LspCapabilities = z.infer<typeof LspCapabilitiesSchema>;

export const LspInitializeParamsSchema = z.object({
  processId: z.number(),
  rootUri: z.string().nullable(),
  capabilities: z.object({
    textDocument: z.object({
      completion: z.object({ dynamicRegistration: z.boolean() }),
      publishDiagnostics: z.object({ relatedInformation: z.boolean() }),
    }),
  }),
  clientInfo: z.object({ name: z.string(), version: z.string() }),
});

export type LspInitializeParams = z.infer<typeof LspInitializeParamsSchema>;

export const LspInitializeResultSchema = z.object({
  capabilities: LspCapabilitiesSchema,
  serverInfo: z.object({ name: z.string(), version: z.string() }).optional(),
});

export type LspInitializeResult = z.infer<typeof LspInitializeResultSchema>;

export const LspDiagnosticSchema = z.object({
  range: z.object({
    start: z.object({ line: z.number(), character: z.number() }),
    end: z.object({ line: z.number(), character: z.number() }),
  }),
  severity: z.number(),
  code: z.union([z.string(), z.number()]).optional(),
  source: z.string().optional(),
  message: z.string(),
});

export type LspDiagnostic = z.infer<typeof LspDiagnosticSchema>;

export const LspHoverResultSchema = z.object({
  contents: z.union([z.object({ kind: z.string(), value: z.string() }), z.string()]),
  range: z.object({
    start: z.object({ line: z.number(), character: z.number() }),
    end: z.object({ line: z.number(), character: z.number() }),
  }).optional(),
});

export type LspHoverResult = z.infer<typeof LspHoverResultSchema>;

export const LspDefinitionResultSchema = z.object({
  uri: z.string(),
  range: z.object({
    start: z.object({ line: z.number(), character: z.number() }),
    end: z.object({ line: z.number(), character: z.number() }),
  }),
});

export type LspDefinitionResult = z.infer<typeof LspDefinitionResultSchema>;

export const LspSymbolResultSchema = z.object({
  name: z.string(),
  kind: z.number(),
  location: z.object({ uri: z.string(), range: z.unknown() }),
});

export type LspSymbolResult = z.infer<typeof LspSymbolResultSchema>;

export const LspDiagnosticEventSchema = z.object({
  uri: z.string(),
  diagnostics: z.array(LspDiagnosticSchema),
});

export type LspDiagnosticEvent = z.infer<typeof LspDiagnosticEventSchema>;

export const LspServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  languageId: z.string(),
  fileExtensions: z.array(z.string()),
});

export type LspServerConfig = z.infer<typeof LspServerConfigSchema>;

export class LspClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private capabilities: LspCapabilities | null = null;
  private rootUri: string | null = null;
  private initialized = false;
  private diagnostics = new Map<string, LspDiagnostic[]>();

  constructor(
    private command: string,
    private args: string[],
    private cwd: string
  ) {
    super();
  }

  async initialize(rootUri: string): Promise<LspInitializeResult> {
    this.rootUri = rootUri;

    this.process = spawn(this.command, this.args, {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stderr?.on("data", (d) => {
      this.emit("stderr", d.toString());
    });

    this.process.on("exit", (code) => {
      this.initialized = false;
      this.rejectAllPending(new Error(`LSP server exited with code ${code}`));
      this.emit("exit", code);
    });

    this.setupMessageHandler();

    const result = await this.request<LspInitializeResult>("initialize", {
      processId: process.pid,
      rootUri: this.pathToUri(rootUri),
      capabilities: {
        textDocument: {
          completion: { dynamicRegistration: false },
          publishDiagnostics: { relatedInformation: true },
        },
      },
      clientInfo: { name: "openflow-cli", version: "1.0.0" },
    } as LspInitializeParams);

    this.capabilities = result.capabilities;

    await this.notify("initialized", {});
    this.initialized = true;

    return result;
  }

  async openDocument(uri: string, text: string, version = 1): Promise<void> {
    await this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: this.detectLanguage(uri), version, text },
    });
  }

  async changeDocument(uri: string, text: string, version: number): Promise<void> {
    await this.notify("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  async closeDocument(uri: string): Promise<void> {
    await this.notify("textDocument/didClose", {
      textDocument: { uri },
    });
  }

  async hover(uri: string, line: number, character: number): Promise<LspHoverResult | null> {
    return this.request<LspHoverResult | null>("textDocument/hover", {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async definition(uri: string, line: number, character: number): Promise<LspDefinitionResult | null> {
    const result = await this.request<LspDefinitionResult | LspDefinitionResult[] | null>(
      "textDocument/definition",
      {
        textDocument: { uri },
        position: { line, character },
      }
    );

    if (Array.isArray(result)) return result[0] ?? null;
    return result;
  }

  async references(uri: string, line: number, character: number): Promise<LspDefinitionResult[]> {
    const result = await this.request<LspDefinitionResult[] | null>(
      "textDocument/references",
      {
        textDocument: { uri },
        position: { line, character },
        context: { includeDeclaration: true },
      }
    );

    return result ?? [];
  }

  async workspaceSymbols(query: string): Promise<LspSymbolResult[]> {
    const result = await this.request<LspSymbolResult[] | null>(
      "workspace/symbol",
      { query }
    );

    return result ?? [];
  }

  async completion(uri: string, line: number, character: number): Promise<unknown[]> {
    const result = await this.request<{ items: unknown[] } | null>(
      "textDocument/completion",
      {
        textDocument: { uri },
        position: { line, character },
      }
    );

    return result?.items ?? [];
  }

  getDiagnostics(uri: string): LspDiagnostic[] {
    return this.diagnostics.get(uri) ?? [];
  }

  getAllDiagnostics(): Map<string, LspDiagnostic[]> {
    return new Map(this.diagnostics);
  }

  getCapabilities(): LspCapabilities | null {
    return this.capabilities;
  }

  isReady(): boolean {
    return this.initialized;
  }

  shutdown(): void {
    if (this.process) {
      void this.notify("shutdown", {}).catch(() => {});
      this.process.kill("SIGTERM");
      this.process = null;
    }
    this.initialized = false;
    this.pending.clear();
  }

  private setupMessageHandler(): void {
    if (!this.process?.stdout) return;

    let buffer = "";

    this.process.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.startsWith("Content-Length:")) {
          const contentLength = parseInt(line.split(":")[1].trim(), 10);

          const headerEnd = buffer.indexOf("\r\n\r\n");
          if (headerEnd >= 0) {
            const content = buffer.slice(headerEnd + 4, headerEnd + 4 + contentLength);
            buffer = buffer.slice(headerEnd + 4 + contentLength);

            try {
              const message = JSON.parse(content);
              this.handleMessage(message);
            } catch {
              this.emit("error", new Error("Failed to parse LSP message"));
            }
          }
        }
      }
    });
  }

  private handleMessage(message: unknown): void {
    const msg = message as { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown };

    if (msg.id != null && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);

      if (msg.error) {
        reject(new Error(`LSP error: ${JSON.stringify(msg.error)}`));
      } else {
        resolve(msg.result);
      }
    }

    if (msg.method === "textDocument/publishDiagnostics") {
      const params = msg.params as LspDiagnosticEvent;
      this.diagnostics.set(params.uri, params.diagnostics);
      this.emit("diagnostics", params);
    }
  }

  private request<T>(method: string, params: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });

      const message = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.send(message);
    });
  }

  private notify(method: string, params: unknown): Promise<void> {
    const message = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.send(message);
    return Promise.resolve();
  }

  private send(message: unknown): void {
    if (!this.process?.stdin) return;

    const content = JSON.stringify(message);
    const header = `Content-Length: ${content.length}\r\n\r\n`;
    this.process.stdin.write(header + content);
  }

  private rejectAllPending(error: Error): void {
    for (const { reject } of this.pending.values()) {
      reject(error);
    }
    this.pending.clear();
  }

  private detectLanguage(uri: string): string {
    const ext = uri.split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: "typescript",
      tsx: "typescriptreact",
      js: "javascript",
      jsx: "javascriptreact",
      py: "python",
      go: "go",
      rs: "rust",
      java: "java",
      cpp: "cpp",
      c: "c",
      rb: "ruby",
    };
    return map[ext ?? ""] ?? "plaintext";
  }

  private pathToUri(path: string): string {
    return `file://${path}`;
  }
}

export const BUILTIN_LSP_SERVERS: Record<string, LspServerConfig> = {
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"],
    languageId: "typescript",
    fileExtensions: [".ts", ".tsx", ".js", ".jsx"],
  },
  python: {
    command: "pyright-langserver",
    args: ["--stdio"],
    languageId: "python",
    fileExtensions: [".py"],
  },
  go: {
    command: "gopls",
    args: [],
    languageId: "go",
    fileExtensions: [".go"],
  },
  rust: {
    command: "rust-analyzer",
    args: [],
    languageId: "rust",
    fileExtensions: [".rs"],
  },
};

export async function startLspForFile(
  filePath: string,
  workspaceRoot: string,
  servers?: Record<string, LspServerConfig>
): Promise<LspClient | null> {
  const config = servers ?? BUILTIN_LSP_SERVERS;
  const ext = filePath.split(".").pop()?.toLowerCase();

  for (const server of Object.values(config)) {
    if (server.fileExtensions.includes(`.${ext}`)) {
      const client = new LspClient(server.command, server.args ?? [], workspaceRoot);
      await client.initialize(workspaceRoot);
      return client;
    }
  }

  return null;
}
