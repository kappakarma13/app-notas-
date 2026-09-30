import { FlexcilDocument, DevicePeer } from '../types';

export type SyncEventType = 
  | 'DOC_UPDATE' 
  | 'STROKE_DRAW' 
  | 'PAGE_CHANGE' 
  | 'AUDIO_SYNC' 
  | 'IMAGE_PASTE' 
  | 'PEERS_UPDATE' 
  | 'DEVICE_JOINED';

export interface SyncMessage {
  type: string;
  senderId?: string;
  senderName?: string;
  senderDevice?: string;
  docId?: string;
  doc?: FlexcilDocument;
  stroke?: any;
  pageNumber?: number;
  image?: any;
  audio?: any;
  timestamp?: number;
  peers?: DevicePeer[];
  peerCount?: number;
}

class RealtimeSyncService {
  private ws: WebSocket | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private myDeviceId: string;
  private myDeviceName: string;
  private myDeviceType: 'windows' | 'tablet' | 'phone' | 'mac' | 'browser';
  private myColor: string;
  private currentRoomId: string = 'global_study_room';
  private listeners: Set<(msg: SyncMessage) => void> = new Set();
  private peerList: DevicePeer[] = [];
  private isConnected: boolean = false;
  private reconnectTimer: any = null;

  constructor() {
    this.myDeviceId = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    
    // Detect device type & default friendly name
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    if (ua.includes('windows')) {
      this.myDeviceType = 'windows';
      this.myDeviceName = 'Mi PC Windows';
    } else if (ua.includes('ipad') || (ua.includes('macintosh') && 'ontouchend' in document)) {
      this.myDeviceType = 'tablet';
      this.myDeviceName = 'Mi iPad Pro';
    } else if (ua.includes('android')) {
      this.myDeviceType = ua.includes('mobile') ? 'phone' : 'tablet';
      this.myDeviceName = ua.includes('mobile') ? 'Móvil Android' : 'Tablet Android';
    } else if (ua.includes('iphone')) {
      this.myDeviceType = 'phone';
      this.myDeviceName = 'Mi iPhone';
    } else if (ua.includes('mac')) {
      this.myDeviceType = 'mac';
      this.myDeviceName = 'Mi Mac';
    } else {
      this.myDeviceType = 'browser';
      this.myDeviceName = 'Dispositivo Web';
    }

    const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    this.myColor = colors[Math.floor(Math.random() * colors.length)];

    // Initialize cross-tab BroadcastChannel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('flexcil_cross_device_sync');
        this.broadcastChannel.onmessage = (event) => {
          this.handleIncomingMessage(event.data);
        };
      } catch (err) {
        console.warn('BroadcastChannel not supported:', err);
      }
    }

    // Connect to WebSocket server
    this.connectWebSocket();
  }

  private connectWebSocket() {
    if (typeof window === 'undefined') return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        // Identify ourselves
        this.ws?.send(
          JSON.stringify({
            type: 'IDENTIFY',
            deviceName: this.myDeviceName,
            deviceType: this.myDeviceType,
            color: this.myColor,
            roomId: this.currentRoomId,
          })
        );
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingMessage(data);
        } catch (e) {
          // ignore
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.connectWebSocket();
        }, 3000);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch (e) {
      console.warn('WebSocket connection error:', e);
    }
  }

  private handleIncomingMessage(data: SyncMessage) {
    if (data.senderId === this.myDeviceId) return; // ignore our own reflections

    if (data.type === 'PEERS_LIST' && data.peers) {
      this.peerList = data.peers.filter((p: any) => p.id !== this.myDeviceId);
    }

    // Notify all UI listeners
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (e) {
        console.error('Error in sync listener:', e);
      }
    });
  }

  public subscribe(listener: (msg: SyncMessage) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public broadcast(message: SyncMessage) {
    const fullMsg: SyncMessage = {
      ...message,
      senderId: this.myDeviceId,
      senderName: this.myDeviceName,
      senderDevice: this.myDeviceType,
      timestamp: Date.now(),
    };

    // 1. Send via local BroadcastChannel (cross-tab / multi-window)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(fullMsg);
      } catch (e) {
        // ignore
      }
    }

    // 2. Send via WebSocket (cross-device: Windows PC, Tablet, Phone)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(fullMsg));
      } catch (e) {
        // ignore
      }
    }
  }

  public broadcastDocUpdate(doc: FlexcilDocument) {
    this.broadcast({
      type: 'DOC_UPDATE',
      docId: doc.id,
      doc,
    });
  }

  public broadcastPageChange(docId: string, pageNumber: number) {
    this.broadcast({
      type: 'PAGE_CHANGE',
      docId,
      pageNumber,
    });
  }

  public broadcastStrokeDraw(docId: string, pageNumber: number, stroke: any) {
    this.broadcast({
      type: 'STROKE_DRAW',
      docId,
      pageNumber,
      stroke,
    });
  }

  public broadcastImagePaste(docId: string, pageNumber: number, image: any) {
    this.broadcast({
      type: 'IMAGE_PASTE',
      docId,
      pageNumber,
      image,
    });
  }

  public broadcastAudioSync(docId: string, pageNumber: number, audio: any) {
    this.broadcast({
      type: 'AUDIO_SYNC',
      docId,
      pageNumber,
      audio,
    });
  }

  public setDeviceName(name: string) {
    this.myDeviceName = name;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'IDENTIFY',
          deviceName: this.myDeviceName,
          deviceType: this.myDeviceType,
          color: this.myColor,
          roomId: this.currentRoomId,
        })
      );
    }
  }

  public setRoomId(roomId: string) {
    this.currentRoomId = roomId;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'IDENTIFY',
          deviceName: this.myDeviceName,
          deviceType: this.myDeviceType,
          color: this.myColor,
          roomId: this.currentRoomId,
        })
      );
    }
  }

  public getMyDevice() {
    return {
      id: this.myDeviceId,
      name: this.myDeviceName,
      type: this.myDeviceType,
      color: this.myColor,
      roomId: this.currentRoomId,
      isConnected: this.isConnected,
    };
  }

  public getPeers(): DevicePeer[] {
    return [...this.peerList];
  }
}

export const realtimeSync = new RealtimeSyncService();
