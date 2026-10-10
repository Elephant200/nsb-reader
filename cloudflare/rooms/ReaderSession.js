/* global WebSocketPair, Response, crypto */
import ReaderRoom from '../../shared/rooms/ReaderRoom.js';
import Questions from '../database/questions.js';
import getRandomName from '../../shared/get-random-name.js';
import readerUsername from '../../server/multiplayer/reader-username.js';
import { CATEGORIES } from '../../shared/categories.js';
import { guard } from './TrafficGuard.js';

/** One persistent reader room with hibernating player sockets and role-specific views. */
export class ReaderSession {
  constructor (ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.questions = new Questions(env.DB);
    this.sockets = new Map(ctx.getWebSockets().map(ws => [ws, ws.deserializeAttachment()]).filter(([, identity]) => identity));
    this.rates = new Map();
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL)');
    const rows = ctx.storage.sql.exec('SELECT data FROM room_state WHERE id = 1').toArray();
    this.room = rows.length ? JSON.parse(rows[0].data) : null;
    if (this.room) {
      this.game = Object.assign(new ReaderRoom(), this.room.game);
      this.game.migrateHistory();
      const onlinePlayers = new Set([...this.sockets.values()].map(identity => identity.playerId));
      for (const player of Object.values(this.game.players)) player.online = onlinePlayers.has(player.id);
      if (!this.readerOnline()) { this.game.stopTimer(); this.game.paused = true; }
      if (!this.sockets.size && !this.room.emptySince) {
        this.room.emptySince = Date.now();
        ctx.blockConcurrencyWhile(() => this.save());
      }
    }
  }

  async fetch (request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/initialize') {
      return this.ctx.blockConcurrencyWhile(async () => {
        if (this.room) return new Response('Occupied', { status: 409 });
        const { code, readerToken } = await request.json();
        this.game = new ReaderRoom();
        this.room = { code, readerToken, identities: {}, seen: [], locked: false, emptySince: Date.now() };
        await this.save();
        return new Response(null, { status: 201 });
      });
    }
    return this.ctx.blockConcurrencyWhile(() => this.connect(request));
  }

  async connect (request) {
    const url = new URL(request.url);
    const [client, socket] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(socket);
    const fail = message => {
      socket.send(JSON.stringify({ type: 'error', message, fatal: true }));
      socket.close(1008, 'Cannot join room');
      return new Response(null, { status: 101, webSocket: client });
    };
    const token = url.searchParams.get('token') || '';
    const reader = url.searchParams.get('role') === 'reader';
    if (!/^[a-zA-Z0-9-]{32,80}$/.test(token)) return fail('Invalid room code.');
    if (!this.room || this.room.ended) return fail('Room not found.');
    if (reader && token !== this.room.readerToken) return fail('Reader access denied.');
    if (!reader && token === this.room.readerToken) return fail('Use the player join screen.');
    if (this.sockets.size >= 500) return fail('Room is full.');
    let playerId = this.room.identities[token];
    if (!reader && playerId && this.game.players[playerId].kicked) return fail('You were removed from this room.');
    if (!reader && !playerId && this.room.locked) return fail('Room is locked.');
    if (!reader && !playerId && Object.keys(this.game.players).length >= 500) return fail('Room is full.');
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    const lease = crypto.randomUUID();
    if (!await guard(this.env, ip, 'connect', { id: lease })) return fail('Connection limit reached.');
    if (!reader) {
      if (!playerId) {
        playerId = crypto.randomUUID();
        let username;
        do { username = getRandomName(); } while (Object.values(this.game.players).some(p => p.username === username));
        this.room.identities[token] = playerId;
        this.game.join(playerId, username);
      }
      this.game.players[playerId].online = true;
      const savedName = readerUsername(url.searchParams.get('username'), this.game.players, playerId);
      if (savedName) this.game.players[playerId].username = savedName;
    }
    for (const [oldSocket, identity] of this.sockets) {
      if ((reader && identity.reader) || (!reader && identity.playerId === playerId)) {
        oldSocket.send(JSON.stringify({ type: 'error', message: 'Connected in another tab.', fatal: true }));
        oldSocket.close(1000, 'Replaced');
        this.sockets.delete(oldSocket);
        await guard(this.env, identity.ip, 'release', { id: identity.lease });
      }
    }
    const identity = { reader, playerId: playerId || null, ip, lease };
    socket.serializeAttachment(identity);
    this.sockets.set(socket, identity);
    this.room.emptySince = null;
    await this.save();
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  readerOnline () { return [...this.sockets].some(([ws, identity]) => identity.reader && ws.readyState === 1); }

  broadcast () {
    for (const [ws, identity] of this.sockets) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(identity.reader
          ? { ...this.game.readerView(), code: this.room.code, locked: this.room.locked, loading: !!this.loading }
          : this.game.playerView(identity.playerId, this.readerOnline())));
      }
    }
  }

  async save () {
    this.room.game = { ...this.game };
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO room_state (id, data) VALUES (1, ?)', JSON.stringify(this.room));
    const expiry = this.room.emptySince ? this.room.emptySince + 3600000 : Date.now() + 60000;
    const deadline = this.game.timer.deadline;
    await this.ctx.storage.setAlarm(deadline && deadline > Date.now() ? Math.min(expiry, deadline + 5) : expiry);
  }

  async webSocketMessage (ws, data) {
    const identity = this.sockets.get(ws);
    if (!identity || this.room.ended) return;
    if (typeof data !== 'string' || new TextEncoder().encode(data).length > 10240) { ws.close(1009, 'Message too large'); return; }
    const rate = this.rates.get(ws) || { start: Date.now(), count: 0 };
    if (Date.now() - rate.start >= 1000) { rate.start = Date.now(); rate.count = 0; }
    this.rates.set(ws, rate);
    if (++rate.count > 50) return;
    try {
      const message = JSON.parse(data);
      if (!message || typeof message.type !== 'string') return;
      const { reader, playerId } = identity;
      if (!reader) {
        if (message.type === 'buzz' && this.readerOnline()) this.game.buzz(playerId);
        else if (message.type === 'set-username') {
          const username = readerUsername(message.username, this.game.players, playerId);
          if (!username) throw new Error('Choose an available username of 1–32 characters.');
          this.game.players[playerId].username = username;
          ws.send(JSON.stringify({ type: 'username-saved', username }));
        } else return;
      } else if (message.type === 'end-room') {
        this.room.ended = true;
        this.room.emptySince = Date.now();
        for (const [socket, user] of this.sockets) {
          socket.send(JSON.stringify({ type: 'room-ended' }));
          socket.close(1000, 'Room ended');
          await guard(this.env, user.ip, 'release', { id: user.lease });
        }
        this.sockets.clear();
      } else if (message.type === 'next') {
        if (this.loading || this.game.historyIndex !== null) return;
        if (!this.game.nextBonus() && this.game.needsQuestion()) {
          const category = message.category || '';
          const setName = message.setName || '';
          const packetNumber = Number(message.packetNumber);
          if (typeof category !== 'string' || (category && !CATEGORIES.includes(category)) || typeof setName !== 'string' || setName.length > 200) return;
          if (setName && (!Number.isInteger(packetNumber) || packetNumber < 1 || packetNumber > 1000)) return;
          this.loading = true;
          this.broadcast();
          try {
            const tossups = setName ? (await this.questions.packet({ setName, packetNumber })).tossups : await this.questions.random('tossup', { categories: category ? [category] : CATEGORIES, number: 100 });
            const tossup = tossups.find(q => !this.room.seen.includes(q._id) && (!category || q.category === category));
            if (!tossup) throw new Error('No unread questions in this selection.');
            const bonus = await this.questions.pairedBonus(tossup.packet._id, tossup.number);
            if (!this.room.ended && this.game.load({ tossup, bonus })) this.room.seen.push(tossup._id);
          } finally { this.loading = false; }
        }
      } else if (message.type === 'move-player') {
        if (typeof message.id === 'string' && [0, 1].includes(message.team) && Number.isInteger(message.index)) this.game.move(message.id, message.team, message.index);
      } else if (message.type === 'kick') {
        const p = typeof message.id === 'string' && Object.hasOwn(this.game.players, message.id) ? this.game.players[message.id] : null;
        if (p && !p.kicked) {
          p.lastAssignment = this.game.assignment(message.id);
          p.kicked = true;
          p.online = false;
          this.game.teams = this.game.teams.map(team => team.filter(id => id !== message.id));
          for (const [socket, user] of this.sockets) {
            if (user.playerId === message.id) {
              socket.send(JSON.stringify({ type: 'error', message: 'You were removed from this room.', fatal: true }));
              socket.close(1008, 'Removed');
              this.sockets.delete(socket);
              await guard(this.env, user.ip, 'release', { id: user.lease });
            }
          }
        }
      } else if (message.type === 'lock' && typeof message.locked === 'boolean') this.room.locked = message.locked;
      else if (message.type === 'history-select') this.game.selectHistory(message.index);
      else this.game.action(message);
      await this.save();
      this.broadcast();
    } catch (error) {
      this.broadcast();
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', message: error instanceof SyntaxError ? 'Invalid message.' : error.message }));
    }
  }

  async webSocketClose (ws) {
    const identity = this.sockets.get(ws);
    if (!identity) return;
    this.sockets.delete(ws);
    this.rates.delete(ws);
    await guard(this.env, identity.ip, 'release', { id: identity.lease });
    if (identity.playerId && ![...this.sockets.values()].some(user => user.playerId === identity.playerId)) this.game.players[identity.playerId].online = false;
    if (identity.reader && !this.readerOnline()) { this.game.stopTimer(); this.game.paused = true; }
    if (!this.sockets.size) this.room.emptySince = Date.now();
    await this.save();
    this.broadcast();
  }

  async webSocketError (ws) { await this.webSocketClose(ws); ws.close(1011, 'Connection error'); }

  async alarm () {
    if (!this.room) return;
    if (this.room.emptySince && Date.now() - this.room.emptySince >= 3600000) {
      this.ctx.storage.sql.exec('DELETE FROM room_state');
      this.room = null;
      return;
    }
    for (const [ws, user] of this.sockets) {
      if (ws.readyState !== 1) await this.webSocketClose(ws);
      else if (!await guard(this.env, user.ip, 'renew', { id: user.lease })) ws.close(1008, 'Connection limit reached');
    }
    await this.save();
    this.broadcast();
  }
}
