import { wsUrl } from '../config/network';
import { TokenManager } from './api';

export type SocketEventHandler = (data: any) => void;

class SocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly initialBackoffMs = 1000;
  private eventHandlers: Set<SocketEventHandler> = new Set();
  private isIntentionalClose = false;

  public async connect(path: string = '/events/ws'): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const token = await TokenManager.getToken();
      if (!token) {
        console.warn('[SocketService] No token available, skipping WebSocket connection.');
        return;
      }

      const url = `${wsUrl(path)}?token=${token}`;
      this.isIntentionalClose = false;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[SocketService] Connected successfully.');
        this.reconnectAttempts = 0; // Reset attempts on success
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.eventHandlers.forEach((handler) => handler(data));
        } catch (e) {
          console.error('[SocketService] Error parsing message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[SocketService] Connection closed.');
        this.ws = null;
        this.handleReconnect(path);
      };

      this.ws.onerror = (err) => {
        console.error('[SocketService] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[SocketService] Connection error:', err);
      this.handleReconnect(path);
    }
  }

  public disconnect(): void {
    this.isIntentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public send(data: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[SocketService] Cannot send message, socket is not open.');
    }
  }

  public subscribe(handler: SocketEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  private handleReconnect(path: string): void {
    if (this.isIntentionalClose) {
      return;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const backoffMs = this.initialBackoffMs * Math.pow(2, this.reconnectAttempts);
      console.log(`[SocketService] Reconnecting in ${backoffMs}ms... (Attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.reconnectAttempts++;
        this.connect(path);
      }, backoffMs);
    } else {
      console.error('[SocketService] Max reconnect attempts reached. Could not connect.');
    }
  }
}

export const socketService = new SocketService();
