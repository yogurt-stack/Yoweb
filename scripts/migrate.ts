import { databasePath, migrateDatabase, openDatabase } from '../src/db/connection';

const connection = openDatabase();
try {
  migrateDatabase(connection);
  console.log(`迁移完成：${databasePath()}`);
} finally {
  connection.sqlite.close();
}
