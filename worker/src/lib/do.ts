import type { Env } from '../env';

/**
 * Tiny façade over the stream Durable Objects.
 *
 * The `streamId` is always passed as a query parameter so the object can
 * re-hydrate its identity from storage after hibernating.
 */

const DO_ORIGIN = 'https://durable-object.local';

export function chatRoom(env: Env, streamId: string): DurableObjectStub {
  return env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(streamId));
}

export function signalRoom(env: Env, streamId: string): DurableObjectStub {
  return env.SIGNAL_ROOM.get(env.SIGNAL_ROOM.idFromName(streamId));
}

/** Push an event to every socket connected to a stream's chat room. */
export async function broadcastToStream(env: Env, streamId: string, event: Record<string, unknown>): Promise<void> {
  try {
    await chatRoom(env, streamId).fetch(`${DO_ORIGIN}/broadcast?streamId=${encodeURIComponent(streamId)}`, {
      method: 'POST',
      body: JSON.stringify(event),
    });
  } catch (error) {
    console.error('broadcast failed', error);
  }
}

/** Insert a system chat message and fan it out. */
export async function systemMessage(env: Env, streamId: string, message: string, type = 'system'): Promise<void> {
  try {
    await chatRoom(env, streamId).fetch(`${DO_ORIGIN}/system?streamId=${encodeURIComponent(streamId)}`, {
      method: 'POST',
      body: JSON.stringify({ message, type }),
    });
  } catch (error) {
    console.error('system message failed', error);
  }
}

/** Current presence (viewer count + host connectivity) for a stream. */
export async function streamPresence(env: Env, streamId: string): Promise<{ viewers: number; hostConnected: boolean; live: boolean }> {
  const response = await chatRoom(env, streamId).fetch(`${DO_ORIGIN}/presence?streamId=${encodeURIComponent(streamId)}`);
  return response.json<{ viewers: number; hostConnected: boolean; live: boolean }>();
}
