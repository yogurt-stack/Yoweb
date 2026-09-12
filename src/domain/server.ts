import 'server-only';
import { getConnection } from '../db/connection';
import { Library } from './library';

export function library() {
  return new Library(getConnection());
}
