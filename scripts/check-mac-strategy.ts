import { spawn } from 'child_process';
import http from 'http';
import { AddressInfo } from 'net';
import path from 'path';

import { Server } from 'socket.io';

import { buildMacStrategyLaunch } from '../src/main/strategy/launch';
import { MacStrategyWorker } from '../src/main/strategy/macWorker';
import { READ_PDD_EXPRESSION, sendPddExpression } from '../src/main/strategy/pddScript';
import { splitReply } from '../src/main/strategy/reply';
import { parseIoPacket } from '../src/main/strategy/socketClient';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function checkPackets() {
  assert(parseIoPacket('0{"sid":"a"}').kind === 'connect', 'connect packet');
  const event = parseIoPacket('2["strategyService-getAppsInfo"]');
  assert(event.kind === 'event' && event.id === undefined, 'event without ack');
  const acked = parseIoPacket('20["strategyService-getAppsInfo"]');
  assert(
    acked.kind === 'event' &&
      acked.id === 0 &&
      acked.data[0] === 'strategyService-getAppsInfo',
    'event with ack id 0',
  );
  const ack = parseIoPacket('31[{"ok":true}]');
  assert(ack.kind === 'ack' && ack.id === 1, 'ack packet');
  assert(splitReply('你好[截断]世界', '[截断]', 10).join('|') === '你好|世界', 'split key');
  assert(splitReply('abcd', '', 2).join('|') === 'ab|cd', 'split count');
  // eslint-disable-next-line no-new-func
  new Function(`return ${READ_PDD_EXPRESSION}`);
  // eslint-disable-next-line no-new-func
  new Function(`return ${sendPddExpression('你好')}`);
}

function checkLaunchShape() {
  const launch = buildMacStrategyLaunch({
    port: 9999,
    dirname: path.join(__dirname, '../src/main/system'),
    isDev: true,
    env: {},
    nodeBin: 'node',
  });
  assert(launch.mode === 'node', 'dev mode uses node');
  assert(launch.args.includes('--port'), 'port flag');
  assert(launch.args.includes('9999'), 'dev port');
  assert(
    launch.args.some((arg) => arg.endsWith('macWorker.ts')),
    'dev worker path',
  );
}

async function listen() {
  const server = http.createServer();
  const io = new Server(server, {
    cors: { origin: '*' },
    transports: ['websocket'],
  });
  const seen: Array<{ ctx: Record<string, unknown>; msgs: Array<{ content: string }> }> = [];
  io.on('connection', (socket) => {
    socket.on('messageService-getMessages', (data, callback) => {
      seen.push(data);
      callback({ type: 'TEXT', content: '测试回复' });
    });
    socket.on('messageService-broadcast', (_msg, callback) => {
      callback({ ok: true });
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    io,
    port,
    seen,
    async close() {
      await new Promise<void>((resolve) => {
        io.close();
        server.close(() => resolve());
      });
    },
  };
}

async function waitForPlatforms(io: Server) {
  const started = Date.now();
  let last: unknown;
  while (Date.now() - started < 10000) {
    try {
      const response = await io.timeout(1000).emitWithAck('strategyService-getAppsInfo');
      if (
        Array.isArray(response) &&
        Array.isArray(response[0]) &&
        response[0].some((item) => item && item.id === 'pinduoduo')
      ) {
        return response[0] as Array<{ id: string; name: string }>;
      }
      last = response;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`platform list was not ready: ${JSON.stringify(last)}`);
}

async function checkProtocol() {
  const gateway = await listen();
  const sent: string[] = [];
  let opened = 0;
  const worker = new MacStrategyWorker({
    port: gateway.port,
    host: '127.0.0.1',
    pollMs: 60000,
    deps: {
      openBrowser: async () => {
        opened += 1;
      },
      closeBrowser: async () => undefined,
      readSnapshot: async () => ({
        href: 'https://mms.pinduoduo.com/chat-merchant/index.html',
        loggedIn: true,
        buyer: '测试买家',
        goods: '水杯',
        goodsId: '1',
        orderStatus: '待发货',
        orderId: 'o1',
        orderAmount: '10',
        goodsSpec: '大号',
        logistics: '',
        sampleClasses: [],
        messages: [
          {
            sender: '测试买家',
            content: '什么时候发货',
            role: 'OTHER',
            type: 'TEXT',
          },
        ],
      }),
      sendText: async (_session, text) => {
        sent.push(text);
        return { ok: true };
      },
    },
  });
  await worker.start();
  try {
    const platforms = await waitForPlatforms(gateway.io);
    assert(
      platforms.some((item) => item.id === 'pinduoduo' && item.name === '拼多多'),
      'pinduoduo missing',
    );
    assert(
      platforms.some((item) => item.id === 'win_qianniu' && item.name === '千牛'),
      'qianniu missing',
    );

    const health = await gateway.io.timeout(3000).emitWithAck('systemService-health');
    assert(Array.isArray(health) && health[0] === true, `health ${JSON.stringify(health)}`);

    await worker.pollOnce();
    assert(gateway.seen.length === 0, 'paused worker must not reply');

    await gateway.io.timeout(3000).emitWithAck('strategyService-updateStatus', {
      status: 'RUNNING',
      jdr: '',
      twkey: '',
      twcount: 2,
    });
    const created = await gateway.io.timeout(3000).emitWithAck('strategyService-updateTasks', {
      tasks: [{ task_id: 7, app_id: 'pinduoduo', env_id: '' }],
    });
    assert(Array.isArray(created) && Array.isArray(created[0]), `tasks ${JSON.stringify(created)}`);
    const first = created[0][0];
    assert(first.task_id === '7', 'task id string');
    assert(typeof first.env_id === 'string' && first.env_id.startsWith('mac-pinduoduo-'), 'env id');
    assert(!first.error, 'pinduoduo task error');

    const again = await gateway.io.timeout(3000).emitWithAck('strategyService-updateTasks', {
      tasks: [{ task_id: 7, app_id: 'pinduoduo', env_id: first.env_id }],
    });
    assert(again[0][0].env_id === first.env_id, 'env id is stable');
    assert(opened === 1, `browser opened ${opened} times`);

    await worker.pollOnce();
    assert(gateway.seen.length === 1, 'one getMessages call');
    assert(gateway.seen[0].ctx.CTX_APP_ID === 'pinduoduo', 'app id');
    assert(gateway.seen[0].ctx.CTX_INSTANCE_ID === '7', 'instance id');
    assert(gateway.seen[0].ctx.CTX_ORDER_AMOUNT === '10', 'order amount');
    assert(gateway.seen[0].msgs[0].content === '什么时候发货', 'buyer text');
    assert(sent.join('|') === '测试|回复', `sent parts ${sent.join('|')}`);

    await worker.pollOnce();
    assert(gateway.seen.length === 1, 'dedup failed');

    const unknown = await gateway.io.timeout(3000).emitWithAck('strategyService-updateTasks', {
      tasks: [{ task_id: '9', app_id: 'not-a-platform', env_id: '' }],
    });
    assert(unknown[0][0].error, 'unknown platform should error');
  } finally {
    await worker.shutdown();
    await gateway.close();
  }
}

async function checkSpawnedCli() {
  const gateway = await listen();
  const repo = path.join(__dirname, '..');
  const child = spawn(
    process.execPath,
    [
      '-r',
      'ts-node/register/transpile-only',
      path.join(repo, 'src/main/strategy/macWorker.ts'),
      '--port',
      String(gateway.port),
    ],
    {
      cwd: repo,
      env: {
        ...process.env,
        COCS_STRATEGY_NO_BROWSER: '1',
        TS_NODE_TRANSPILE_ONLY: '1',
        NODE_ENV: 'development',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let logs = '';
  child.stdout?.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    logs += chunk.toString();
  });
  try {
    const platforms = await waitForPlatforms(gateway.io);
    assert(platforms.some((item) => item.id === 'pinduoduo'), 'spawned worker has no pinduoduo');
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 4000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await gateway.close();
  }
}

async function main() {
  checkPackets();
  checkLaunchShape();
  await checkProtocol();
  await checkSpawnedCli();
  console.log('mac strategy protocol check passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
