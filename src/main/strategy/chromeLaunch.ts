import { spawn, ChildProcess, execFileSync } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

const DARWIN_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
];

const LINUX_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
];

export function findChromeBinary(): string | null {
  const override = process.env.COCS_CHROME_PATH;
  if (override && fs.existsSync(override)) {
    return override;
  }

  const home = os.homedir();
  const candidates =
    process.platform === 'darwin'
      ? [
          ...DARWIN_CANDIDATES,
          path.join(
            home,
            'Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          ),
        ]
      : LINUX_CANDIDATES;

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found || null;
}

export function readChromeVersion(binary: string): string | null {
  try {
    const stdout = execFileSync(binary, ['--version'], {
      encoding: 'utf8',
      timeout: 8000,
    });
    const match = String(stdout).match(/\d+\.\d+\.\d+/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

export function chromeProfileDir(envId: string): string {
  const safe = envId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return path.join(
    os.homedir(),
    'Documents',
    'chatgpt-on-cs',
    'chrome-profiles',
    safe,
  );
}

export function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('failed to allocate a port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

export type ChromeHandle = {
  pid?: number;
  port: number;
  kill: () => void;
  onExit: (listener: () => void) => void;
};

export async function launchChrome(url: string, envId: string): Promise<ChromeHandle> {
  const binary = findChromeBinary();
  if (!binary) {
    throw new Error(
      '未找到 Chrome。请安装 Google Chrome，或设置 COCS_CHROME_PATH 指向浏览器可执行文件。',
    );
  }
  const port = await getAvailablePort();
  const profile = chromeProfileDir(envId);
  fs.mkdirSync(profile, { recursive: true });
  const child: ChildProcess = spawn(
    binary,
    [
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-popup-blocking',
      url,
    ],
    {
      detached: true,
      stdio: 'ignore',
    },
  );
  const exitListeners: Array<() => void> = [];

  const kill = () => {
    if (!child.pid) {
      return;
    }
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGTERM');
      } catch (inner) {
        console.error(inner);
      }
    }
  };

  child.on('error', (error) => {
    console.error('Failed to launch Chrome', error);
  });
  child.on('exit', () => {
    exitListeners.forEach((listener) => listener());
  });

  return {
    pid: child.pid,
    port,
    kill,
    onExit(listener: () => void) {
      exitListeners.push(listener);
    },
  };
}
