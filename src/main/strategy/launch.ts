import fs from 'fs';
import os from 'os';
import path from 'path';

export type StrategyLaunch = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  mode: 'node' | 'electron-utility';
};

/**
 * Development runs the TypeScript worker with the system Node + ts-node.
 * Packaged builds fork `strategy.js` from the Electron main process
 * (`utilityProcess`) because `ELECTRON_RUN_AS_NODE` cannot read app.asar.
 */
export function buildMacStrategyLaunch(options: {
  port: number;
  dirname: string;
  isDev: boolean;
  env?: NodeJS.ProcessEnv;
  nodeBin?: string;
}): StrategyLaunch {
  const env = { ...(options.env || process.env) };
  if (options.isDev) {
    return {
      mode: 'node',
      command: options.nodeBin || 'node',
      args: [
        '-r',
        'ts-node/register/transpile-only',
        path.join(options.dirname, '../strategy/macWorker.ts'),
        '--port',
        String(options.port),
      ],
      env: {
        ...env,
        NODE_ENV: 'development',
        TS_NODE_TRANSPILE_ONLY: '1',
        COCS_STRATEGY_WATCH_STDIN: '1',
      },
      cwd: path.resolve(options.dirname, '../../..'),
    };
  }

  return {
    mode: 'electron-utility',
    command: '',
    args: [
      resolveStrategyScript(options.dirname),
      '--port',
      String(options.port),
    ],
    env,
    cwd: os.homedir(),
  };
}

export function resolveStrategyScript(dirname: string): string {
  const packed = path.join(dirname, 'strategy.js');
  const unpacked = packed.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  );
  if (unpacked !== packed && fs.existsSync(unpacked)) {
    return unpacked;
  }
  return packed;
}
