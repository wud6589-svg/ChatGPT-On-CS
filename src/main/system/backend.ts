import { ChildProcess, exec, spawn } from 'child_process';
import fs from 'fs';
import { createServer } from 'net';
import path from 'path';

import { utilityProcess } from 'electron';

import { buildMacStrategyLaunch } from '../strategy/launch';
import { getTempPath } from '../utils';

class BackendServiceManager {
  private executablePath: string;

  private process: ReturnType<typeof spawn> | null;

  private logStream: fs.WriteStream;

  private logFilePath: string;

  private port: number;

  private autoRestart: boolean; // 新增自动重启标志

  private macRestartTimer: NodeJS.Timeout | null = null;

  private MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

  private MAX_LOG_FILES = 10;

  constructor(executablePath: string, autoRestart: boolean = true) {
    this.executablePath = executablePath;
    this.process = null;
    this.port = 0;
    this.autoRestart = autoRestart; // 是否自动重启
    this.macRestartTimer = null;
  }

  async start() {
    // Windows 开发模式仍由外部 __main__.exe 连接 9999。
    // macOS 没有可运行的 Windows 策略程序，开发和打包都在这里拉起 Mac worker。
    if (process.platform === 'darwin') {
      await this.startMac();
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      this.port = 9999;
      return;
    }

    // 避免重复启动时端口冲突
    if (!this.port) {
      const port = await this.getAvailablePort();
      this.port = port;
    }

    this.launchProcess(this.port);

    // 监听退出事件并可能重启
    this.process?.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
      if (this.autoRestart) {
        console.log('Attempting to restart...');
        this.start().catch((err) => console.error('Failed to restart:', err));
      }
    });
  }

  private rotateLogs() {
    this.logStream.close();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const newLogFilePath = this.logFilePath.replace(
      'process.log',
      `process-${timestamp}.log`,
    );
    fs.renameSync(this.logFilePath, newLogFilePath);

    const logFiles = fs.readdirSync(path.dirname(this.logFilePath)).sort();
    while (logFiles.length > this.MAX_LOG_FILES) {
      const oldestLogFile = logFiles.shift();
      if (!oldestLogFile) {
        break;
      }
      fs.unlinkSync(path.join(path.dirname(this.logFilePath), oldestLogFile));
    }

    this.logFilePath = path.join(path.dirname(this.logFilePath), 'process.log');
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
  }

  private checkLogSizeAndRotate() {
    const logSize = fs.existsSync(this.logFilePath)
      ? fs.statSync(this.logFilePath).size
      : 0;
    if (logSize > this.MAX_LOG_SIZE) {
      this.rotateLogs();
    }
  }

  private launchProcess(port: number) {
    const logDir = getTempPath();
    this.logFilePath = path.join(logDir, 'process.log');
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });

    this.process = spawn(this.executablePath, ['--port', port.toString()]);
    console.log(
      `Starting backend process: ${this.executablePath} --port ${port}`,
    );

    this.process.stdout?.on('data', (data) => {
      this.logStream.write(`stdout: ${data}`);
      this.checkLogSizeAndRotate();
    });

    this.process.stderr?.on('data', (data) => {
      this.logStream.write(`stderr: ${data}`);
      this.checkLogSizeAndRotate();
    });

    this.process.on('close', () => {
      this.logStream.close();
    });

    this.process.on('error', (err) => {
      console.error('Failed to start subprocess.', err);
    });

    console.log(`Backend process started with PID: ${this.process.pid}`);
  }

  async getAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, () => {
        const { port } = server.address() as { port: number };
        server.close(() => {
          resolve(port);
        });
      });
    });
  }

  stop() {
    // 修改停止方法以标记不自动重启
    return new Promise((resolve, reject) => {
      this.autoRestart = false; // 停止时禁用自动重启
      if (this.macRestartTimer) {
        clearTimeout(this.macRestartTimer);
        this.macRestartTimer = null;
      }
      if (this.process && process.platform === 'win32') {
        console.log('Killing process...');
        const { pid } = this.process;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        exec(`taskkill /pid ${pid} /T /F`, (error, stdout, stderr) => {
          this.process = null;
          if (error) {
            reject(error);
            return;
          }
          resolve({});
        });
        return;
      }
      if (!this.process) {
        resolve({});
        return;
      }
      console.log('Stopping macOS strategy...');
      const child = this.process;
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        this.process = null;
        resolve({});
      };
      const killer = setTimeout(() => {
        if (child.pid) {
          try {
            process.kill(child.pid, 'SIGKILL');
          } catch (error) {
            console.error(error);
          }
        }
        finish();
      }, 4000);
      child.once('exit', () => {
        clearTimeout(killer);
        finish();
      });
      child.once('close', () => {
        clearTimeout(killer);
        finish();
      });
      try {
        child.kill('SIGTERM');
      } catch (error) {
        console.error(error);
        clearTimeout(killer);
        finish();
      }
    });
  }

  private async startMac() {
    if (!this.port) {
      if (process.env.NODE_ENV === 'development') {
        const fromEnv = Number(process.env.PY_PORT || 9999);
        this.port = fromEnv || 9999;
      } else {
        this.port = await this.getAvailablePort();
      }
    }
    this.spawnMac();
  }

  private prepareLog() {
    const logDir = getTempPath();
    this.logFilePath = path.join(logDir, 'process.log');
    if (this.logStream) {
      this.logStream.end();
    }
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
  }

  private spawnMac() {
    this.prepareLog();
    const launch = buildMacStrategyLaunch({
      port: this.port,
      dirname: __dirname,
      isDev: process.env.NODE_ENV === 'development',
    });
    console.log(
      launch.mode === 'node'
        ? `Starting macOS strategy: ${launch.command} ${launch.args.join(' ')}`
        : `Starting macOS strategy utility: ${launch.args.join(' ')}`,
    );

    if (launch.mode === 'node') {
      this.process = spawn(launch.command, launch.args, {
        cwd: launch.cwd,
        env: launch.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      const child = utilityProcess.fork(launch.args[0], launch.args.slice(1), {
        cwd: launch.cwd,
        env: launch.env as NodeJS.ProcessEnv,
        stdio: 'pipe',
        serviceName: 'cocs-strategy',
      });
      this.process = child as unknown as ChildProcess;
    }

    this.process.stdout?.on('data', (data) => {
      this.logStream.write(`stdout: ${data}`);
      this.checkLogSizeAndRotate();
    });
    this.process.stderr?.on('data', (data) => {
      this.logStream.write(`stderr: ${data}`);
      this.checkLogSizeAndRotate();
    });
    this.process.on('error', (err) => {
      console.error('Failed to start macOS strategy.', err);
    });
    this.process.on('exit', (code) => {
      console.log(`macOS strategy exited with code ${code}`);
      try {
        this.logStream.end();
      } catch (error) {
        console.error(error);
      }
      if (this.autoRestart) {
        console.log('Attempting to restart macOS strategy...');
        this.macRestartTimer = setTimeout(() => {
          if (this.autoRestart) {
            this.spawnMac();
          }
        }, 1000);
      }
    });
    console.log(`macOS strategy started with PID: ${this.process.pid}`);
  }

  getPort() {
    return this.port;
  }
}

export default BackendServiceManager;
