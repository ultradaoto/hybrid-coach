import { useAuthStore } from '@/stores/authStore';

type MessageHandler = (data: unknown) => void;

interface ConnectionOptions {
  onMessage?: MessageHandler;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
}

class WebSocketManager {
  private connections: Map<string, WebSocket> = new Map();
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private reconnectDisabled: Map<string, boolean> = new Map();
  private maxReconnectAttempts = 3;
  private reconnectDelay = 2000;
  
  connect(endpoint: string, handlers?: ConnectionOptions): WebSocket | null {
    // Close existing connection if any
    this.disconnect(endpoint);
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const token = useAuthStore.getState().token;
    
    const url = new URL(`${protocol}//${host}${endpoint}`);
    if (token) {
      url.searchParams.set('token', token);
    }
    
    let ws: WebSocket;
    try {
      ws = new WebSocket(url.toString());
    } catch (err) {
      console.warn(`WebSocket connection failed for ${endpoint}:`, err);
      handlers?.onError?.(new Event('error'));
      return null;
    }
    
    ws.onopen = () => {
      console.log(`[WS] Connected: ${endpoint}`);
      this.reconnectAttempts.set(endpoint, 0);
      this.reconnectDisabled.set(endpoint, false);
      handlers?.onOpen?.();
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handlers?.onMessage?.(data);
        
        // Notify all registered handlers
        const endpointHandlers = this.handlers.get(endpoint);
        if (endpointHandlers) {
          endpointHandlers.forEach((handler) => handler(data));
        }
      } catch (err) {
        console.warn('[WS] Message parse error:', err);
      }
    };
    
    ws.onclose = (event) => {
      console.log(`[WS] Closed: ${endpoint} (code: ${event.code})`);
      this.connections.delete(endpoint);
      handlers?.onClose?.();
      
      // Only auto-reconnect if enabled and not explicitly disabled
      const shouldReconnect = handlers?.autoReconnect !== false && 
                              !this.reconnectDisabled.get(endpoint);
      
      if (shouldReconnect) {
        const attempts = this.reconnectAttempts.get(endpoint) || 0;
        if (attempts < this.maxReconnectAttempts) {
          this.reconnectAttempts.set(endpoint, attempts + 1);
          const delay = this.reconnectDelay * Math.pow(2, attempts);
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);
          setTimeout(() => {
            if (!this.reconnectDisabled.get(endpoint)) {
              this.connect(endpoint, handlers);
            }
          }, delay);
        } else {
          console.warn(`[WS] Max reconnect attempts reached for ${endpoint}`);
          this.reconnectDisabled.set(endpoint, true);
        }
      }
    };
    
    ws.onerror = (error) => {
      // Don't spam console - just log once
      console.warn(`[WS] Error on ${endpoint} - endpoint may not be available`);
      handlers?.onError?.(error);
      // Disable reconnect on error to prevent flooding
      this.reconnectDisabled.set(endpoint, true);
    };
    
    this.connections.set(endpoint, ws);
    return ws;
  }
  
  disconnect(endpoint: string): void {
    const ws = this.connections.get(endpoint);
    if (ws) {
      ws.close();
      this.connections.delete(endpoint);
    }
  }
  
  disconnectAll(): void {
    this.connections.forEach((ws) => ws.close());
    this.connections.clear();
  }
  
  send(endpoint: string, data: unknown): boolean {
    const ws = this.connections.get(endpoint);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }
  
  addHandler(endpoint: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(endpoint)) {
      this.handlers.set(endpoint, new Set());
    }
    this.handlers.get(endpoint)!.add(handler);
    
    // Return cleanup function
    return () => {
      this.handlers.get(endpoint)?.delete(handler);
    };
  }
  
  isConnected(endpoint: string): boolean {
    const ws = this.connections.get(endpoint);
    return ws?.readyState === WebSocket.OPEN;
  }
}

export const wsManager = new WebSocketManager();
