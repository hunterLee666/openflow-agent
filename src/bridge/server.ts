import { createServer, type Server, type Socket } from "node:net";
import { createHash } from "node:crypto";
import type { BridgeServer, BridgeMessage } from "./types.js";

export class JsonRpcBridgeServer implements BridgeServer {
  private server?: Server;
  private sockets = new Set<Socket>();
  private handlers: ((msg: BridgeMessage) => void)[] = [];
  private buffer = "";

  async start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((socket) => {
        this.sockets.add(socket);
        socket.on("data", (data) => {
          this.handleData(data.toString());
        });
        socket.on("close", () => {
          this.sockets.delete(socket);
        });
      });

      this.server.listen(port, () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) {
      socket.end();
    }
    this.sockets.clear();
    this.server?.close();
  }

  onMessage(handler: (msg: BridgeMessage) => void): void {
    this.handlers.push(handler);
  }

  send(msg: BridgeMessage): void {
    const data = JSON.stringify(msg);
    const frame = `Content-Length: ${Buffer.byteLength(data)}\r\n\r\n${data}`;
    for (const socket of this.sockets) {
      socket.write(frame);
    }
  }

  private handleData(data: string): void {
    this.buffer += data;
    while (true) {
      const headerMatch = this.buffer.match(/Content-Length:\s*(\d+)\r\n\r\n/);
      if (!headerMatch) break;

      const length = parseInt(headerMatch[1], 10);
      const headerEnd = this.buffer.indexOf("\r\n\r\n") + 4;
      const bodyStart = headerEnd;
      const bodyEnd = bodyStart + length;

      if (this.buffer.length < bodyEnd) break;

      const body = this.buffer.slice(bodyStart, bodyEnd);
      this.buffer = this.buffer.slice(bodyEnd);

      try {
        const msg = JSON.parse(body) as BridgeMessage;
        for (const handler of this.handlers) {
          handler(msg);
        }
      } catch {
        // Ignore malformed messages
      }
    }
  }
}

export function generateBridgeToken(secret: string): string {
  return createHash("sha256").update(secret + Date.now()).digest("hex").slice(0, 32);
}
