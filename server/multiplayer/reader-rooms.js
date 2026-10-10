import { randomInt, randomUUID } from 'node:crypto';
import ReaderRoom from '../../shared/rooms/ReaderRoom.js';

export const readerRooms = new Map();

/** Allocate a numeric join code and a separate private reader credential. */
export function createReaderRoom () {
  if (readerRooms.size >= 1000) throw new Error('Room capacity reached.');
  let code;
  do { code = String(randomInt(100000, 1000000)); } while (readerRooms.has(code));
  const readerToken = randomUUID();
  const room = { game: new ReaderRoom(), readerToken, sockets: new Map(), identities: new Map(), seen: new Set(), loading: false, locked: false };
  readerRooms.set(code, room);
  room.cleanup = setTimeout(() => readerRooms.delete(code), 60 * 60 * 1000).unref();
  return { code, readerToken };
}
