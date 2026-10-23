import http from 'http';

import { connectWebSocket, TinyWebSocket } from './webSocket';

type CdpTarget = {
  id?: string;
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
};

export class CdpPage {
  private ws: TinyWebSocket | null = null;

  private nextId = 1;

  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  private opened = false;

  constructor(private readonly webSocketUrl: string) {}

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('CDP connect timeout'));
      }, 8000);
      this.ws = connectWebSocket(this.webSocketUrl, {
        onOpen: () => {
          this.opened = true;
          clearTimeout(timer);
          resolve();
        },
        onText: (text) => {
          this.onMessage(text);
        },
        onClose: (reason) => {
          this.opened = false;
          clearTimeout(timer);
          this.pending.forEach((pending) => {
            pending.reject(new Error(reason));
          });
          this.pending.clear();
          reject(new Error(reason));
        },
      });
    });
  }

  close() {
    this.opened = false;
    this.ws?.close();
    this.ws = null;
  }

  async evaluate<T>(expression: string, userGesture = false): Promise<T> {
    const result = (await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture,
    })) as {
      result?: { value?: T };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    };
    if (result.exceptionDetails) {
      const detail =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        'CDP evaluate failed';
      throw new Error(detail);
    }
    return result.result?.value as T;
  }

  private send(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.opened || !this.ws) {
      return Promise.reject(new Error('CDP is not connected'));
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.ws?.send(JSON.stringify({ id, method, params }));
    });
  }

  private onMessage(text: string) {
    let message: {
      id?: number;
      result?: unknown;
      error?: { message?: string };
    };
    try {
      message = JSON.parse(text);
    } catch (error) {
      console.error(error);
      return;
    }
    if (message.id === undefined) {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message || 'CDP error'));
      return;
    }
    pending.resolve(message.result);
  }
}

function httpGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(2000, () => {
      request.destroy(new Error('CDP list timeout'));
    });
    request.on('error', reject);
  });
}

export async function connectCdpPage(
  port: number,
  urlIncludes: string,
): Promise<CdpPage | null> {
  let targets: CdpTarget[] = [];
  try {
    const listed = await httpGetJson(`http://127.0.0.1:${port}/json/list`);
    if (Array.isArray(listed)) {
      targets = listed as CdpTarget[];
    }
  } catch (error) {
    return null;
  }
  const pages = targets.filter(
    (target) => target.type === 'page' && target.webSocketDebuggerUrl,
  );
  const matched =
    pages.find((target) => (target.url || '').includes(urlIncludes)) || pages[0];
  if (!matched || !matched.webSocketDebuggerUrl) {
    return null;
  }
  const page = new CdpPage(matched.webSocketDebuggerUrl);
  await page.open();
  return page;
}

export async function waitForCdp(
  port: number,
  urlIncludes: string,
  timeoutMs = 15000,
): Promise<CdpPage | null> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      const page = await connectCdpPage(port, urlIncludes);
      if (page) {
        return page;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (lastError) {
    console.error(lastError);
  }
  return null;
}
