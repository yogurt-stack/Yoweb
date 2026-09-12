import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase, migrateDatabase } from '../../src/db/connection';

test('生产 Web 进程退出再启动，题目、问法与归档状态完整恢复', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yoweb-restart-'));
  const connection = openDatabase(join(directory, 'yoweb.sqlite'));
  migrateDatabase(connection);
  connection.sqlite.close();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('无法分配测试端口');
  const port = address.port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined;
  async function start() {
    child = spawn(
      process.execPath,
      [
        resolve('node_modules/next/dist/bin/next'),
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      {
        env: { ...process.env, YOWEB_DATA_DIR: directory, NEXT_TELEMETRY_DISABLED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let logs = '';
    child.stdout!.on('data', (data) => {
      logs += String(data);
    });
    child.stderr!.on('data', (data) => {
      logs += String(data);
    });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`服务提前退出：${logs}`);
      try {
        if ((await fetch(`${base}/api/terms`, { signal: AbortSignal.timeout(1000) })).ok) return;
      } catch {
        /* Wait for this owned server to listen. */
      }
      await delay(100);
    }
    throw new Error(`服务启动超时：${logs}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const stopped = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child?.kill('SIGKILL'), 5000);
    try {
      await stopped;
    } finally {
      clearTimeout(timer);
      child = undefined;
    }
  }
  async function write(path: string, data: unknown) {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    expect(response.ok).toBe(true);
    return (await response.json()).data;
  }
  try {
    await start();
    const question = await write('/api/questions', {
      text: '生产重启持久化',
      status: 'ORGANIZED',
      topicIds: ['00000000-0000-4000-8000-000000000002'],
    });
    await write(`/api/questions/${question.id}/wordings`, {
      text: '重启还能找到吗？',
      sourceLocator: '测试笔记',
    });
    const archived = await write(`/api/questions/${question.id}/archive`, {});
    await stop();
    await start();
    const read = await fetch(`${base}/api/questions/${question.id}`);
    expect((await read.json()).data).toEqual(archived);
    const list = await fetch(`${base}/api/questions`);
    expect((await list.json()).data.total).toBe(0);
    const restored = await write(`/api/questions/${question.id}/restore`, {});
    expect(restored.status).toBe('ORGANIZED');
    expect(restored.topics[0].name).toBe('Agent');
    expect(restored.wordings[0].text).toBe('重启还能找到吗？');
    const html = await fetch(`${base}/questions/${question.id}`);
    expect(html.ok).toBe(true);
    expect(await html.text()).toContain('生产重启持久化');
  } finally {
    await stop();
  }
});
