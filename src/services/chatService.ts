/**
 * Stream chat — REST for history, Durable Object WebSocket for live delivery.
 *
 * Previously Supabase Realtime (`postgres_changes` on `chat_messages`). The
 * Cloudflare equivalent is a per-stream `ChatRoom` Durable Object; presence and
 * moderation events ride the same socket.
 */

import { api, apiSocket } from '@/integrations/api/client';
import { toChatMessage, toChatMessages } from '@/integrations/api/mappers';
import type { ChatMessage } from '@/types';

interface SendChatMessageParams {
  streamId: string;
  userId: string;
  username: string;
  userAvatar?: string;
  message: string;
  type?: 'text' | 'emote' | 'donation' | 'system';
  metadata?: unknown;
}

export interface StreamChatEvent {
  /** `chat` = new/relayed message, `presence` = viewer count, `stream` = live status. */
  type: 'chat' | 'presence' | 'moderation' | 'stream' | 'ready' | 'typing';
  message?: ChatMessage;
  viewers?: number;
  hostConnected?: boolean;
  live?: boolean;
  status?: string;
  messageId?: string;
  isModerated?: boolean;
}

export interface ChatSubscription {
  close(): void;
}

export const chatService = {
  async getChatMessages(streamId: string): Promise<ChatMessage[]> {
    try {
      const data = await api.get<{ messages: unknown[] }>(`/streams/${streamId}/chat`, { query: { limit: 100 } });
      return toChatMessages(data.messages);
    } catch (err) {
      console.error('Error fetching chat messages:', err);
      return [];
    }
  },

  async sendChatMessage(params: SendChatMessageParams): Promise<ChatMessage | null> {
    try {
      const { streamId, message, type = 'text', metadata } = params;
      const data = await api.post<{ message: unknown }>(`/streams/${streamId}/chat`, { message, type, metadata });
      return toChatMessage(data.message);
    } catch (err) {
      console.error('Error sending chat message:', err);
      return null;
    }
  },

  async moderateMessage(messageId: string, isModerated: boolean): Promise<boolean> {
    try {
      await api.patch(`/chat/${messageId}`, { isModerated });
      return true;
    } catch (err) {
      console.error('Error moderating message:', err);
      return false;
    }
  },

  async getLatestChatMessages(streamId: string, limit = 50): Promise<ChatMessage[]> {
    try {
      const data = await api.get<{ messages: unknown[] }>(`/streams/${streamId}/chat`, { query: { limit } });
      return toChatMessages(data.messages);
    } catch (err) {
      console.error('Error fetching latest chat messages:', err);
      return [];
    }
  },

  /**
   * Opens the live socket for a stream. Reconnects with backoff; returns a
   * handle with `close()`. Safe to call for anonymous visitors — they just
   * will not be able to post.
   */
  subscribeToStream(streamId: string, onEvent: (event: StreamChatEvent) => void): ChatSubscription {
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;

      const ws = apiSocket(`/api/ws/chat/${streamId}`, { params: { role: 'viewer' } });
      socket = ws;

      ws.onopen = () => {
        retry = 0;
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as StreamChatEvent;
          onEvent(payload);
        } catch (error) {
          console.warn('Malformed chat frame', error);
        }
      };

      ws.onclose = () => {
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        const delay = Math.min(1000 * 2 ** retry, 30_000);
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        /* onclose handles reconnection */
      };
    };

    connect();

    return {
      close() {
        closed = true;
        if (timer) clearTimeout(timer);
        if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
        socket = null;
      },
    };
  },
};
