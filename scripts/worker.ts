import { openDatabase } from '../src/db/connection';

// Sprint 1 is an executable health-check entry, not a scheduler.
const connection = openDatabase();
try {
  connection.sqlite.prepare('SELECT id FROM questions LIMIT 1').get();
  console.log('Worker 数据库连接正常。Sprint 1 未启用后台任务，检查后退出。');
} finally {
  connection.sqlite.close();
}
