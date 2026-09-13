import 'dotenv/config';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as schema from './schema';

export function databasePath() {
  return resolve(process.env.YOWEB_DATA_DIR || './data', 'yoweb.sqlite');
}
export function openDatabase(path = databasePath()) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('journal_mode = WAL');
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
export type Connection = ReturnType<typeof openDatabase>;

export function migrateDatabase(connection: Connection) {
  migrate(connection.db, { migrationsFolder: resolve('drizzle') });
  // Stable IDs keep edited seed names from being recreated on subsequent runs.
  const topics = [
    'LLM',
    'Agent',
    'Coding Agent',
    'RAG',
    '后端工程',
    '计算机基础',
    '算法与数据结构',
  ];
  connection.sqlite.transaction(() => {
    for (const [i, name] of topics.entries()) {
      const now = new Date().toISOString();
      connection.db
        .insert(schema.terms)
        .values({
          id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
          kind: 'TOPIC',
          name,
          nameKey: name.toLowerCase(),
          aliases: [],
          creationSource: 'SEED',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();
    }
  })();
}

const globals = globalThis as typeof globalThis & { yowebConnection?: Connection };
export function getConnection() {
  if (!globals.yowebConnection) {
    const connection = openDatabase();
    try {
      connection.sqlite.prepare('SELECT id FROM questions LIMIT 1').get();
      connection.sqlite.prepare('SELECT id FROM import_batches LIMIT 1').get();
    } catch {
      connection.sqlite.close();
      throw new Error('数据库尚未初始化，请先运行 npm run db:migrate');
    }
    globals.yowebConnection = connection;
  }
  return globals.yowebConnection;
}
export const newId = randomUUID;
