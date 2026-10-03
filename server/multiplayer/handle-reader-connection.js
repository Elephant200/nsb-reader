import { randomUUID } from 'node:crypto';
import { readerRooms } from './reader-rooms.js';
import getRandomName from '../../shared/get-random-name.js';
import { CATEGORIES } from '../../shared/categories.js';
import getRandomTossups from '../../database/qbreader/get-random-tossups.js';
import getPacket from '../../database/qbreader/get-packet.js';
import getPairedBonus from '../../database/qbreader/get-paired-bonus.js';
import { clientIp, isBannedIp } from '../moderation/ip-filter.js';
import { MAX_CONNECTIONS_PER_IP, MAX_ONLINE_PLAYERS } from './constants.js';
import RateLimit from '../RateLimit.js';

const connections = new Map();
const rateLimit = new RateLimit(50, 1000);

/** Authenticate a reader or player and send only that role's state projection. */
export default function handleReaderConnection (ws, req) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const code = params.get('code');
  const token = params.get('token');
  const reader = params.get('role') === 'reader';
  const ip = clientIp(req);
  const fail = message => { ws.send(JSON.stringify({ type: 'error', message, fatal: true })); ws.close(); };
  if (!/^\d{6}$/.test(code || '') || !/^[a-zA-Z0-9-]{32,80}$/.test(token || '')) return fail('Invalid room code.');
  if (isBannedIp(ip) || !req.headers['user-agent'] || (connections.get(ip) || 0) >= MAX_CONNECTIONS_PER_IP) return fail('Connection limit reached.');
  const room = readerRooms.get(code);
  if (!room) return fail('Room not found.');
  if (reader && room.readerToken !== token) return fail('Reader access denied.');
  if (room.sockets.size >= MAX_ONLINE_PLAYERS) return fail('Room is full.');
  let playerId;
  if (!reader) {
    if (token === room.readerToken) return fail('Use the player join screen.');
    playerId = room.identities.get(token);
    if (playerId && room.game.players[playerId].kicked) return fail('You were removed from this room.');
    if (!playerId) {
      if (room.locked) return fail('Room is locked.');
      if (Object.keys(room.game.players).length >= MAX_ONLINE_PLAYERS) return fail('Room is full.');
      let username;
      do { username = getRandomName(); } while (Object.values(room.game.players).some(p => p.username === username));
      playerId = randomUUID();
      room.identities.set(token, playerId);
      room.game.join(playerId, username);
    } else room.game.players[playerId].online = true;
  }
  clearTimeout(room.cleanup);
  for (const [socket, identity] of room.sockets) {
    if ((reader && identity.reader) || (!reader && identity.playerId === playerId)) {
      room.sockets.delete(socket);
      socket.send(JSON.stringify({ type: 'error', message: 'Connected in another tab.', fatal: true }));
      socket.close();
    }
  }
  room.sockets.set(ws, { reader, playerId });
  connections.set(ip, (connections.get(ip) || 0) + 1);
  const readerOnline = () => [...room.sockets].some(([socket, identity]) => identity.reader && socket.readyState === 1);
  const broadcast = () => {
    for (const [socket, identity] of room.sockets) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(identity.reader
          ? { ...room.game.readerView(), code, locked: room.locked, loading: room.loading }
          : room.game.playerView(identity.playerId, readerOnline())));
      }
    }
  };
  const scheduleTimer = () => {
    clearTimeout(room.timerTimeout);
    if (room.game.timer.deadline !== null) room.timerTimeout = setTimeout(broadcast, room.game.remaining() + 5).unref();
  };
  broadcast();
  ws.on('message', async data => {
    if (!room.sockets.has(ws) || rateLimit(ws) || ws.readyState !== 1) return;
    try {
      const message = JSON.parse(data.toString());
      if (!message || typeof message.type !== 'string') return;
      if (!reader) {
        if (message.type === 'buzz' && readerOnline()) room.game.buzz(playerId);
      } else if (message.type === 'next') {
        if (room.loading) return;
        if (room.game.nextBonus()) { broadcast(); return; }
        if (!room.game.needsQuestion()) return;
        const category = message.category || '';
        const setName = message.setName || '';
        const packetNumber = Number(message.packetNumber);
        if (typeof category !== 'string' || (category && !CATEGORIES.includes(category)) || typeof setName !== 'string' || setName.length > 200) return;
        if (setName && (!Number.isInteger(packetNumber) || packetNumber < 1 || packetNumber > 1000)) return;
        room.loading = true;
        broadcast();
        try {
          const tossups = setName ? (await getPacket({ setName, packetNumber })).tossups : await getRandomTossups({ categories: category ? [category] : CATEGORIES, number: 100 });
          const tossup = tossups.find(q => !room.seen.has(q._id) && (!category || q.category === category));
          if (!tossup) throw new Error('No unread questions in this selection.');
          const bonus = await getPairedBonus(tossup.packet._id, tossup.number);
          if (room.game.load({ tossup, bonus })) room.seen.add(tossup._id);
        } finally { room.loading = false; }
      } else if (message.type === 'move-player') {
        if (typeof message.id === 'string' && [0, 1].includes(message.team) && Number.isInteger(message.index)) room.game.move(message.id, message.team, message.index);
      } else if (message.type === 'kick') {
        const p = typeof message.id === 'string' && Object.hasOwn(room.game.players, message.id) ? room.game.players[message.id] : null;
        if (p && !p.kicked) {
          p.lastAssignment = room.game.assignment(message.id);
          p.kicked = true;
          p.online = false;
          room.game.teams = room.game.teams.map(team => team.filter(id => id !== message.id));
          for (const [socket, identity] of room.sockets) {
            if (identity.playerId === message.id) {
              room.sockets.delete(socket);
              socket.send(JSON.stringify({ type: 'error', message: 'You were removed from this room.', fatal: true }));
              socket.close();
            }
          }
        }
      } else if (message.type === 'lock' && typeof message.locked === 'boolean') room.locked = message.locked;
      else room.game.action(message);
      scheduleTimer();
      broadcast();
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: reader ? error.message : 'Unable to process buzzer action.' }));
      broadcast();
    }
  });
  ws.on('close', () => {
    room.sockets.delete(ws);
    const count = (connections.get(ip) || 1) - 1;
    if (count > 0) connections.set(ip, count);
    else connections.delete(ip);
    if (playerId && ![...room.sockets.values()].some(identity => identity.playerId === playerId)) room.game.players[playerId].online = false;
    if (reader && !readerOnline()) { room.game.stopTimer(); room.game.paused = true; }
    broadcast();
    if (!room.sockets.size) {
      clearTimeout(room.timerTimeout);
      room.cleanup = setTimeout(() => readerRooms.delete(code), 60 * 60 * 1000).unref();
    }
  });
  ws.on('error', () => ws.close());
}
