import 'server-only';
import { getConnection } from '../db/connection';
import { Library } from './library';
import { Ingestion } from './ingestion';

export function library() {
  return new Library(getConnection());
}

export function ingestion() {
  return new Ingestion(getConnection());
}
