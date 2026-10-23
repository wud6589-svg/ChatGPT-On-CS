import crypto from 'crypto';
import net from 'net';

export type WebSocketHandlers = {
  onOpen: () => void;
  onText: (text: string) => void;
  onClose: (reason: string) => void;
};

export type TinyWebSocket = {
  send: (text: string) => void;
  close: () => void;
};

const MAX_PAYLOAD = 10 * 1024 * 1024;

/**
 * Minimal RFC6455 client. The strategy worker runs under plain Node
 * (development) and Electron-as-Node / utilityProcess (packaged), so it
 * cannot assume a global WebSocket.
 */
export function connectWebSocket(
  url: string,
  handlers: WebSocketHandlers,
): TinyWebSocket {
  const target = new URL(url);
  const key = crypto.randomBytes(16).toString('base64');
  const port = Number(target.port || 80);
  const socket = net.connect({ host: target.hostname, port });
  let buffer = Buffer.alloc(0);
  let handshakeDone = false;
  let opened = false;
  let closed = false;
  let fragmentOpcode = 0;
  let fragment = Buffer.alloc(0);

  const fail = (reason: string) => {
    if (closed) {
      return;
    }
    closed = true;
    handlers.onClose(reason);
    socket.destroy();
  };

  const sendFrame = (opcode: number, payload: Buffer) => {
    if (!opened || closed) {
      return;
    }
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i += 1) {
      masked[i] = payload[i] ^ mask[i % 4];
    }
    let header: Buffer;
    if (payload.length < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    socket.write(Buffer.concat([header, mask, masked]));
  };

  const emitMessage = (opcode: number, payload: Buffer) => {
    if (opcode === 0x1 || opcode === 0x2) {
      handlers.onText(payload.toString('utf8'));
      return;
    }
    if (opcode === 0x8) {
      fail('close frame');
      return;
    }
    if (opcode === 0x9) {
      sendFrame(0xa, payload);
    }
  };

  const parseFrames = () => {
    while (buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) {
          return;
        }
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) {
          return;
        }
        const wide = buffer.readBigUInt64BE(2);
        if (wide > BigInt(MAX_PAYLOAD)) {
          fail('frame too large');
          return;
        }
        length = Number(wide);
        offset = 10;
      }
      if (length > MAX_PAYLOAD) {
        fail('frame too large');
        return;
      }
      const maskLength = masked ? 4 : 0;
      if (buffer.length < offset + maskLength + length) {
        return;
      }
      let payload = buffer.slice(offset + maskLength, offset + maskLength + length);
      if (masked) {
        const mask = buffer.slice(offset, offset + 4);
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i += 1) {
          unmasked[i] = payload[i] ^ mask[i % 4];
        }
        payload = unmasked;
      }
      buffer = buffer.slice(offset + maskLength + length);

      if (opcode === 0x0) {
        fragment = Buffer.concat([fragment, payload]);
        if (fin) {
          emitMessage(fragmentOpcode, fragment);
          fragment = Buffer.alloc(0);
          fragmentOpcode = 0;
        }
        continue;
      }

      if (!fin && (opcode === 0x1 || opcode === 0x2)) {
        fragmentOpcode = opcode;
        fragment = Buffer.from(payload);
        continue;
      }

      emitMessage(opcode, payload);
    }
  };

  socket.on('connect', () => {
    const path = `${target.pathname}${target.search}`;
    if (process.env.COCS_STRATEGY_DEBUG === '1') {
      console.error('ws tcp connect', target.hostname, port, path);
    }
    const request = [
      `GET ${path} HTTP/1.1`,
      `Host: ${target.host}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      `Origin: http://${target.host}`,
      '',
      '',
    ].join('\r\n');
    socket.write(request);
  });

  socket.on('data', (chunk: Buffer) => {
    if (process.env.COCS_STRATEGY_DEBUG === '1') {
      console.error('ws bytes', chunk.length, chunk.slice(0, 80).toString('utf8'));
    }
    buffer = Buffer.concat([buffer, chunk]);
    if (!handshakeDone) {
      const splitAt = buffer.indexOf('\r\n\r\n');
      if (splitAt === -1) {
        return;
      }
      const header = buffer.slice(0, splitAt).toString('utf8');
      buffer = buffer.slice(splitAt + 4);
      if (!/^HTTP\/1\.[01] 101\b/i.test(header)) {
        const status = header.split('\r\n')[0] || 'unknown';
        console.error(`ws handshake header:\n${header}`);
        fail(`handshake failed: ${status}`);
        return;
      }
      handshakeDone = true;
      opened = true;
      handlers.onOpen();
    }
    parseFrames();
  });

  socket.on('error', (error) => {
    console.error('ws error', error);
    fail(error.message);
  });

  socket.on('close', () => {
    if (!closed) {
      closed = true;
      handlers.onClose('socket closed');
    }
  });

  return {
    send(text: string) {
      sendFrame(0x1, Buffer.from(text));
    },
    close() {
      if (closed) {
        return;
      }
      try {
        sendFrame(0x8, Buffer.alloc(0));
      } catch (error) {
        console.error(error);
      }
      fail('client close');
    },
  };
}
