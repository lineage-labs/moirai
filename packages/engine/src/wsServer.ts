import { WebSocketServer, type WebSocket } from "ws";
import type { WsMessage } from "@moirai/shared";

export class BrowserBridge {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
    });
  }

  send(msg: WsMessage): void {
    const json = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) ws.send(json);
    }
  }

  async close(): Promise<void> {
    for (const ws of this.clients) ws.close();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
