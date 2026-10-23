import crypto from 'crypto';

import { CdpPage, waitForCdp } from './cdp';
import { ChromeHandle, launchChrome } from './chromeLaunch';
import { findPlatform, MacPlatform, wirePlatforms } from './platforms';
import { READ_PDD_EXPRESSION, PddSnapshot, sendPddExpression } from './pddScript';
import { dedupKey, ReplyResult, snapshotToPayload, splitReply } from './reply';
import { StrategySocket } from './socketClient';

export type LiveSession = {
  taskId: string;
  appId: string;
  envId: string;
  platform: MacPlatform;
  launchStarted: boolean;
  relaunchAfter: number;
  browser: ChromeHandle | null;
  cdp: CdpPage | null;
  replied: Set<string>;
  hints: Set<string>;
  cooldownUntil: number;
};

export type WorkerDeps = {
  openBrowser: (session: LiveSession) => Promise<void>;
  closeBrowser: (session: LiveSession) => Promise<void>;
  readSnapshot: (session: LiveSession) => Promise<PddSnapshot | null>;
  sendText: (
    session: LiveSession,
    text: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
};

type TaskInput = {
  task_id?: string | number;
  app_id?: string;
  env_id?: string | null;
};

type StatusInput = {
  status?: string;
  jdr?: string;
  twkey?: string;
  twcount?: number;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function defaultOpenBrowser(session: LiveSession) {
  if (process.env.COCS_STRATEGY_NO_BROWSER === '1') {
    console.log(`browser skipped for ${session.platform.name}`);
    return;
  }
  if (!session.platform.url) {
    console.log(`manual platform ${session.platform.name}`);
    return;
  }
  const browser = await launchChrome(session.platform.url, session.envId);
  session.browser = browser;
  browser.onExit(() => {
    session.cdp?.close();
    session.cdp = null;
    session.browser = null;
  });
  if (session.platform.autoReply) {
    session.cdp = await waitForCdp(browser.port, 'pinduoduo');
  }
}

async function defaultCloseBrowser(session: LiveSession) {
  session.cdp?.close();
  session.cdp = null;
  if (session.browser) {
    session.browser.kill();
    session.browser = null;
  }
}

async function defaultReadSnapshot(session: LiveSession): Promise<PddSnapshot | null> {
  if (!session.cdp) {
    return null;
  }
  return session.cdp.evaluate<PddSnapshot>(READ_PDD_EXPRESSION);
}

async function defaultSendText(session: LiveSession, text: string) {
  if (!session.cdp) {
    return { ok: false, reason: 'no-cdp' };
  }
  return session.cdp.evaluate<{ ok: boolean; reason?: string }>(
    sendPddExpression(text),
    true,
  );
}

function newEnvId(appId: string) {
  return `mac-${appId}-${crypto.randomBytes(4).toString('hex')}`;
}

export class MacStrategyWorker {
  private readonly socket: StrategySocket;

  private readonly port: number;

  private readonly sessions = new Map<string, LiveSession>();

  private status: 'RUNNING' | 'STOPPED' = 'STOPPED';

  private twkey = '';

  private twcount = 210;

  private stopped = false;

  private polling = false;

  private pollTimer: NodeJS.Timeout | null = null;

  private loopPromise: Promise<void> | null = null;

  private doneResolve: (() => void) | null = null;

  private readonly donePromise: Promise<void>;

  private readonly deps: WorkerDeps;

  private readonly pollMs: number;

  constructor(options: {
    port: number;
    host?: string;
    pollMs?: number;
    deps?: Partial<WorkerDeps>;
  }) {
    this.port = options.port;
    this.socket = new StrategySocket(options.port, options.host || '127.0.0.1');
    this.pollMs = options.pollMs || 3000;
    this.deps = {
      openBrowser: options.deps?.openBrowser || defaultOpenBrowser,
      closeBrowser: options.deps?.closeBrowser || defaultCloseBrowser,
      readSnapshot: options.deps?.readSnapshot || defaultReadSnapshot,
      sendText: options.deps?.sendText || defaultSendText,
    };
    this.donePromise = new Promise((resolve) => {
      this.doneResolve = resolve;
    });
    this.bindSocket();
  }

  start(): Promise<void> {
    this.loopPromise = this.connectLoop();
    this.pollTimer = setInterval(() => {
      this.pollOnce().catch((error) => {
        console.error(error);
      });
    }, this.pollMs);
    return Promise.resolve();
  }

  done(): Promise<void> {
    return this.donePromise;
  }

  async shutdown() {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.socket.close();
    const sessions = Array.from(this.sessions.values());
    await sessions.reduce(async (previous, session) => {
      await previous;
      await this.deps.closeBrowser(session);
    }, Promise.resolve());
    this.sessions.clear();
    if (this.doneResolve) {
      this.doneResolve();
    }
  }

  async pollOnce() {
    if (this.polling || this.stopped || this.status !== 'RUNNING') {
      return;
    }
    if (!this.socket.connected) {
      return;
    }
    this.polling = true;
    try {
      const sessions = Array.from(this.sessions.values()).filter(
        (session) => session.platform.autoReply,
      );
      await sessions.reduce(async (previous, session) => {
        await previous;
        await this.replyForSession(session);
      }, Promise.resolve());
    } finally {
      this.polling = false;
    }
  }

  private bindSocket() {
    this.socket.on('systemService-health', (_payload, ack) => {
      if (ack) {
        ack(true);
      }
    });

    this.socket.on('strategyService-getAppsInfo', (_payload, ack) => {
      if (ack) {
        ack(wirePlatforms());
      }
    });

    this.socket.on('strategyService-updateStatus', (payload, ack) => {
      const body = (payload || {}) as StatusInput;
      this.status = body.status === 'RUNNING' ? 'RUNNING' : 'STOPPED';
      this.twkey = body.twkey || '';
      this.twcount = typeof body.twcount === 'number' ? body.twcount : 210;
      console.log(`strategy status ${this.status}`);
      if (ack) {
        ack({});
      }
    });

    this.socket.on('strategyService-updateTasks', (payload, ack) => {
      const body = (payload || {}) as { tasks?: TaskInput[] };
      const tasks = Array.isArray(body.tasks) ? body.tasks : [];
      const results = this.applyTasks(tasks);
      if (ack) {
        ack(results);
      }
    });
  }

  private applyTasks(tasks: TaskInput[]) {
    const seen = new Set<string>();
    const results: Array<{ task_id: string; env_id: string; error?: string }> = [];
    tasks.forEach((task) => {
      const taskId = task.task_id === undefined || task.task_id === null
        ? ''
        : String(task.task_id);
      const appId = task.app_id ? String(task.app_id) : '';
      if (!taskId || !appId) {
        results.push({
          task_id: taskId,
          env_id: '',
          error: '缺少 task_id 或 app_id',
        });
        return;
      }
      const platform = findPlatform(appId);
      if (!platform) {
        results.push({
          task_id: taskId,
          env_id: task.env_id ? String(task.env_id) : '',
          error: `未知平台 ${appId}`,
        });
        return;
      }
      seen.add(taskId);
      let session = this.sessions.get(taskId);
      if (!session) {
        const envId = task.env_id ? String(task.env_id) : newEnvId(appId);
        session = {
          taskId,
          appId,
          envId,
          platform,
          launchStarted: false,
          relaunchAfter: 0,
          browser: null,
          cdp: null,
          replied: new Set<string>(),
          hints: new Set<string>(),
          cooldownUntil: 0,
        };
        this.sessions.set(taskId, session);
      }
      results.push({
        task_id: taskId,
        env_id: session.envId,
      });
      const waiting =
        session.relaunchAfter > 0 && Date.now() < session.relaunchAfter;
      if (!session.launchStarted && !waiting) {
        session.launchStarted = true;
        this.openSession(session);
      }
    });

    Array.from(this.sessions.keys()).forEach((taskId) => {
      if (seen.has(taskId)) {
        return;
      }
      const session = this.sessions.get(taskId);
      this.sessions.delete(taskId);
      if (session) {
        this.deps.closeBrowser(session).catch((error) => {
          console.error(error);
        });
      }
    });
    return results;
  }

  private openSession(session: LiveSession) {
    this.deps
      .openBrowser(session)
      .then(() => {
        const where = session.platform.url || '请手动打开客户端';
        return this.uiLog(`已准备 ${session.platform.name} 客服（${where}）`);
      })
      .catch((error) => {
        session.launchStarted = false;
        session.relaunchAfter = Date.now() + 30000;
        const message = error instanceof Error ? error.message : String(error);
        return this.hint(
          session,
          'open',
          `打开 ${session.platform.name} 失败：${message}`,
        );
      })
      .catch((error) => {
        console.error(error);
      });
  }

  private async replyForSession(session: LiveSession) {
    if (Date.now() < session.cooldownUntil) {
      return;
    }
    let snapshot: PddSnapshot | null = null;
    try {
      snapshot = await this.deps.readSnapshot(session);
    } catch (error) {
      console.error(error);
      return;
    }
    if (!snapshot) {
      return;
    }
    if (!snapshot.loggedIn) {
      await this.hint(
        session,
        'login',
        `${session.platform.name} 尚未登录，请在打开的 Chrome 里登录店铺后再开启自动回复`,
      );
      return;
    }
    const unclassified = snapshot.messages.filter((message) => !message.role).length;
    const payload = snapshotToPayload(session.platform, session.taskId, snapshot);
    if (!payload) {
      if (unclassified > 0) {
        await this.hint(
          session,
          'roles',
          `${session.platform.name} 页面已打开，但没能区分买家和客服消息。` +
            `样例 class：${snapshot.sampleClasses.join(' | ') || '无'}`,
        );
      }
      return;
    }
    const key = dedupKey(session.taskId, snapshot);
    if (session.replied.has(key)) {
      return;
    }
    let reply: ReplyResult;
    try {
      reply = (await this.socket.emitWithAck('messageService-getMessages', {
        ctx: payload.ctx,
        msgs: payload.msgs,
      })) as ReplyResult;
    } catch (error) {
      session.cooldownUntil = Date.now() + 15000;
      const message = error instanceof Error ? error.message : String(error);
      await this.hint(session, 'reply-error', `获取回复失败：${message}`);
      return;
    }
    if (!reply || reply.type === 'NO_REPLY' || !reply.content) {
      session.replied.add(key);
      return;
    }
    if (reply.type === 'TRANSFER') {
      session.replied.add(key);
      await this.uiLog(`${session.platform.name} 需要转人工，请在店铺里手动处理`);
      try {
        await this.socket.emitWithAck('messageService-broadcast', {
          event: 'human_task',
          data: {
            message: reply.content || '需要转人工',
            value: session.taskId,
            type: 'strategy',
          },
        });
      } catch (error) {
        console.error(error);
      }
      return;
    }
    if (reply.type && reply.type !== 'TEXT') {
      session.replied.add(key);
      await this.uiLog(`Mac 暂不自动发送 ${reply.type} 消息`);
      return;
    }
    const parts = splitReply(reply.content, this.twkey, this.twcount);
    if (parts.length === 0) {
      session.replied.add(key);
      return;
    }
    let sent = false;
    await parts.reduce(async (previous, part) => {
      await previous;
      const result = await this.deps.sendText(session, part);
      if (!result.ok) {
        throw new Error(result.reason || 'send failed');
      }
      sent = true;
      await sleep(300);
    }, Promise.resolve()).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await this.uiLog(`发送拼多多消息失败：${message}`);
    });
    if (sent) {
      session.replied.add(key);
      await this.uiLog(`已回复 ${snapshot.buyer || '顾客'}：${parts[0]}`);
    } else {
      session.cooldownUntil = Date.now() + 15000;
    }
  }

  private async hint(session: LiveSession, key: string, message: string) {
    if (session.hints.has(key)) {
      return;
    }
    session.hints.add(key);
    await this.uiLog(message);
  }

  private async uiLog(content: string) {
    console.log(content);
    if (!this.socket.connected) {
      return;
    }
    try {
      await this.socket.emitWithAck(
        'messageService-broadcast',
        {
          event: 'log_show',
          data: {
            time: new Date().toLocaleTimeString(),
            content,
          },
        },
        5000,
      );
    } catch (error) {
      console.error(error);
    }
  }

  private async connectLoop() {
    while (!this.stopped) {
      try {
        await this.socket.connectOnce();
        console.log(`mac strategy connected to 127.0.0.1:${this.port}`);
        await this.socket.waitUntilClosed();
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
      }
      if (!this.stopped) {
        await sleep(1000);
      }
    }
  }

}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[index + 1];
}

function isCli() {
  const entry = (process.argv[1] || '').replace(/\\/g, '/');
  return /(?:^|\/)(?:macWorker\.ts|strategy\.js)$/.test(entry);
}

export async function runMacStrategyCli(port: number) {
  const worker = new MacStrategyWorker({ port });
  let stopping = false;
  const requestStop = () => {
    if (stopping) {
      return;
    }
    stopping = true;
    worker.shutdown().finally(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', requestStop);
  process.on('SIGINT', requestStop);
  if (process.env.COCS_STRATEGY_WATCH_STDIN === '1') {
    process.stdin.resume();
    process.stdin.on('end', requestStop);
  }
  await worker.start();
  await worker.done();
}

if (isCli()) {
  const port = Number(readArg('--port') || 9999);
  if (!port) {
    console.error('missing --port');
    process.exit(1);
  }
  runMacStrategyCli(port).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
