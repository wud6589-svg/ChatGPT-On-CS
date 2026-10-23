import { connectWebSocket, TinyWebSocket } from './webSocket';

export type IoPacket =
  | { kind: 'connect' }
  | { kind: 'event'; id?: number; data: unknown[] }
  | { kind: 'ack'; id?: number; data: unknown[] }
  | { kind: 'ignore' };

/**
 * Socket.IO v4 packet bodies (engine.io type already stripped).
 * Default namespace omits the nsp prefix. Ack ids are the digits before `[`.
 */
export function parseIoPacket(packet: string): IoPacket {
  if (!packet) {
    return { kind: 'ignore' };
  }
  const type = packet[0];
  if (type === '0') {
    return { kind: 'connect' };
  }
  if (type !== '2' && type !== '3') {
    return { kind: 'ignore' };
  }
  let rest = packet.slice(1);
  if (rest.startsWith('/')) {
    const comma = rest.indexOf(',');
    rest = comma === -1 ? '' : rest.slice(comma + 1);
  }
  const bracket = rest.indexOf('[');
  const idPart = bracket === -1 ? rest : rest.slice(0, bracket);
  let id: number | undefined;
  if (idPart) {
    const parsed = Number(idPart);
    if (!Number.isNaN(parsed)) {
      id = parsed;
    }
  }
  let data: unknown[] = [];
  if (bracket !== -1) {
    const body = JSON.parse(rest.slice(bracket));
    if (Array.isArray(body)) {
      data = body;
    }
  }
  return {
    kind: type === '2' ? 'event' : 'ack',
    id,
    data,
  };
}

export type StrategyEventHandler = (
  payload: unknown,
  ack?: (body: unknown) => void,
) => void;

/**
 * One Socket.IO client over raw WebSocket, matching the server in
 * `src/main/backend/backend.ts` (`transports: ['websocket']`, EIO=4).
 * `emitWithAck` on the server collects a single ack argument from each client.
 */
export class StrategySocket {
  private ws: TinyWebSocket | null = null;

  private ackSeed = 1;

  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();

  private handlers = new Map<string, StrategyEventHandler>();

  private connectResult: ((error?: Error) => void) | null = null;

  private onDisconnected: (() => void) | null = null;

  connected = false;

  constructor(
    private readonly port: number,
    private readonly host = '127.0.0.1',
  ) {}

  on(event: string, handler: StrategyEventHandler) {
    this.handlers.set(event, handler);
  }

  connectOnce(timeoutMs = 8000): Promise<void> {
    this.closeSocket();
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        this.closeSocket();
        reject(new Error('strategy socket connect timeout'));
      }, timeoutMs);

      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      this.connectResult = finish;
      this.onDisconnected = () => finish(new Error('strategy socket closed'));

      const url =
        `ws://${this.host}:${this.port}/socket.io/?EIO=4&transport=websocket`;
      this.ws = connectWebSocket(url, {
        onOpen: () => {
          // Namespace connect. Events are accepted as soon as the server
          // answers, which is what sets `connected`.
        },
        onText: (text) => {
          this.handleEngine(text);
        },
        onClose: (reason) => {
          if (process.env.COCS_STRATEGY_DEBUG === '1') {
            console.log('ws closed', reason);
          }
          this.connected = false;
          this.rejectPending(new Error('strategy socket closed'));
          const notify = this.onDisconnected;
          this.onDisconnected = null;
          if (notify) {
            notify();
          }
        },
      });

      // `onOpen` runs after the HTTP upgrade. Engine.IO still expects `40`
      // only after the open packet, which `handleEngine` sends.
    });
  }

  waitUntilClosed(): Promise<void> {
    if (!this.connected) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.onDisconnected = () => resolve();
    });
  }

  emitWithAck(event: string, data?: unknown, timeoutMs = 120000): Promise<unknown> {
    if (!this.connected || !this.ws) {
      return Promise.reject(new Error(`strategy socket not connected (${event})`));
    }
    const id = this.ackSeed;
    this.ackSeed += 1;
    const args = data === undefined ? [event] : [event, data];
    const packet = `42${id}${JSON.stringify(args)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ack timeout: ${event}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws?.send(packet);
    });
  }

  close() {
    this.connected = false;
    this.connectResult = null;
    this.rejectPending(new Error('strategy socket closed'));
    this.closeSocket();
    const notify = this.onDisconnected;
    this.onDisconnected = null;
    if (notify) {
      notify();
    }
  }

  private closeSocket() {
    const current = this.ws;
    this.ws = null;
    if (current) {
      current.close();
    }
  }

  private rejectPending(error: Error) {
    this.pending.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(error);
    });
    this.pending.clear();
  }

  private handleEngine(frame: string) {
    if (process.env.COCS_STRATEGY_DEBUG === '1') {
      console.log('engine <<', JSON.stringify(frame));
    }
    frame.split('\u001e').forEach((message) => {
      if (!message) {
        return;
      }
      const type = message[0];
      if (type === '0') {
        this.ws?.send('40');
        return;
      }
      if (type === '2') {
        this.ws?.send('3');
        return;
      }
      if (type === '3' || type === '1') {
        return;
      }
      if (type === '4') {
        this.handleIo(message.slice(1));
      }
    });
  }

  private handleIo(packet: string) {
    let parsed: IoPacket;
    try {
      parsed = parseIoPacket(packet);
    } catch (error) {
      console.error('Failed to parse strategy packet', error);
      return;
    }
    if (parsed.kind === 'connect') {
      this.connected = true;
      if (this.connectResult) {
        const ready = this.connectResult;
        this.connectResult = null;
        ready();
      }
      return;
    }
    if (parsed.kind === 'ack') {
      if (parsed.id === undefined) {
        return;
      }
      const pending = this.pending.get(parsed.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(parsed.id);
      pending.resolve(parsed.data[0]);
      return;
    }
    if (parsed.kind !== 'event') {
      return;
    }
    const eventName = parsed.data[0];
    if (typeof eventName !== 'string') {
      return;
    }
    const payload = parsed.data.length > 1 ? parsed.data[1] : undefined;
    const ackId = parsed.id;
    const ack =
      ackId === undefined
        ? undefined
        : (body: unknown) => {
            this.ws?.send(`43${ackId}${JSON.stringify([body])}`);
          };
    const handler = this.handlers.get(eventName);
    if (!handler) {
      if (ack) {
        ack(null);
      }
      return;
    }
    try {
      handler(payload, ack);
    } catch (error) {
      console.error(`strategy handler failed: ${eventName}`, error);
      if (ack) {
        ack({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}
