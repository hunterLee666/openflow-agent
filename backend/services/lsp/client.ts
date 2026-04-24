import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  LspClient,
  Location,
  DocumentSymbol,
  SymbolInformation,
  Hover,
  CompletionItem,
} from "./types.js";

export class GenericLspClient implements LspClient {
  private proc?: ReturnType<typeof spawn>;
  private requestId = 0;
  private pending = new Map<number, (value: unknown) => void>();
  private initialized = false;

  constructor(private command: string, private args: string[] = []) {}

  async initialize(workspacePath: string): Promise<void> {
    if (this.initialized) return;

    this.proc = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout?.on("data", (data) => {
      this.handleResponse(data.toString());
    });

    await this.sendRequest("initialize", {
      processId: process.pid,
      rootUri: `file://${workspacePath}`,
      capabilities: {},
    });

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    if (!this.proc) return;
    await this.sendRequest("shutdown", {});
    this.proc.stdin?.end();
    this.proc.kill();
    this.initialized = false;
  }

  async goToDefinition(
    filePath: string,
    line: number,
    character: number,
  ): Promise<Location[]> {
    const result = await this.sendRequest("textDocument/definition", {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
    });
    return Array.isArray(result) ? (result as Location[]) : result ? [result as Location] : [];
  }

  async findReferences(
    filePath: string,
    line: number,
    character: number,
  ): Promise<Location[]> {
    const result = await this.sendRequest("textDocument/references", {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
      context: { includeDeclaration: true },
    });
    return (result as Location[]) || [];
  }

  async documentSymbols(filePath: string): Promise<DocumentSymbol[]> {
    const result = await this.sendRequest("textDocument/documentSymbol", {
      textDocument: { uri: `file://${filePath}` },
    });
    return (result as DocumentSymbol[]) || [];
  }

  async workspaceSymbols(query: string): Promise<SymbolInformation[]> {
    const result = await this.sendRequest("workspace/symbol", { query });
    return (result as SymbolInformation[]) || [];
  }

  async hover(filePath: string, line: number, character: number): Promise<Hover | null> {
    const result = await this.sendRequest("textDocument/hover", {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
    });
    return (result as Hover) || null;
  }

  async completions(
    filePath: string,
    line: number,
    character: number,
  ): Promise<CompletionItem[]> {
    const result = await this.sendRequest("textDocument/completion", {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
    });
    return (result as CompletionItem[]) || [];
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) {
        reject(new Error("LSP not initialized"));
        return;
      }

      const id = ++this.requestId;
      this.pending.set(id, resolve);

      const message = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      const headers = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;

      this.proc.stdin.write(headers + message);

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`LSP request timeout: ${method}`));
        }
      }, 10000);
    });
  }

  private handleResponse(data: string): void {
    try {
      const lines = data.split("\r\n").filter((l) => l.trim());
      for (const line of lines) {
        if (line.startsWith("Content-Length:")) continue;
        if (!line.startsWith("{")) continue;

        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const resolve = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          resolve(msg.result);
        }
      }
    } catch {
    }
  }
}

export function detectLspForProject(cwd: string): GenericLspClient | null {
  if (existsSync(join(cwd, "tsconfig.json"))) {
    return new GenericLspClient("typescript-language-server", ["--stdio"]);
  }
  if (existsSync(join(cwd, "go.mod"))) {
    return new GenericLspClient("gopls");
  }
  if (existsSync(join(cwd, "Cargo.toml"))) {
    return new GenericLspClient("rust-analyzer");
  }
  if (existsSync(join(cwd, "requirements.txt")) || existsSync(join(cwd, "pyproject.toml"))) {
    return new GenericLspClient("pylsp");
  }
  return null;
}
