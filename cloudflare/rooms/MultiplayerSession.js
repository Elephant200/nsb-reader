/* global WebSocketPair, Response, crypto */
import ServerTossupBonusRoom from '../../server/multiplayer/ServerTossupBonusRoom.js';
import CategoryManager from '../../shared/category-manager.js';
import getRandomName from '../../shared/get-random-name.js';
import isAppropriateString from '../../server/moderation/is-appropriate-string.js';
import Questions from '../database/questions.js';
import { guard } from './TrafficGuard.js';

/** Runs the shared word-reading engine in one Object for each private room. */
export class MultiplayerSession {
  constructor (ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.connections = new Map();
  }

  async fetch (request) {
    const url = new URL(request.url);
    const name = url.searchParams.get('roomName');
    let userId = url.searchParams.get('userId') || 'unknown';
    if (userId === 'unknown') userId = crypto.randomUUID();
    let username = url.searchParams.get('username') || getRandomName();
    const [client, socket] = Object.values(new WebSocketPair());
    socket.accept();
    const response = () => new Response(null, { status: 101, webSocket: client });
    const fail = message => {
      socket.send(JSON.stringify({ type: 'error', message }));
      socket.close(1008, 'Cannot join room');
      return response();
    };
    if (!/^[\w-]{1,32}$/.test(name || '') || !isAppropriateString(name)) return fail('Invalid room name.');
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail('Invalid player identity.');
    if (!isAppropriateString(username)) username = getRandomName();
    username = [...username].filter(char => char.charCodeAt(0) >= 32 && !'<>'.includes(char)).join('').slice(0, 32);
    if (!this.game) {
      this.game = new ServerTossupBonusRoom(name, userId, false, new CategoryManager());
      clearInterval(this.game.cleanupInterval);
      const db = new Questions(this.env.DB);
      this.game.getPacket = params => db.packet(params);
      this.game.getPacketCount = setName => db.packetCount(setName);
      this.game.getRandomTossups = params => db.random('tossup', params);
      this.game.getRandomBonuses = params => db.random('bonus', params);
      this.game.getPairedBonus = (packetId, number) => db.pairedBonus(packetId, number);
      this.game.getSetList = () => db.sets();
    }
    if (this.game.settings.lock) return fail('The room is locked.');
    if (this.connections.size >= 500) return fail('Room is full.');
    if (this.game.bannedUserList.has(userId) || this.game.kickedUserList.has(userId)) return fail('You were removed from this room.');
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    const lease = crypto.randomUUID();
    if (!await guard(this.env, ip, 'connect', { id: lease })) return fail('Connection limit reached.');
    for (const [oldSocket, identity] of this.connections) {
      if (identity.userId === userId) {
        this.disconnect(oldSocket, false);
        oldSocket.close(1000, 'Connected in another tab');
      }
    }
    // Adapt the Node socket interface without changing the shared protocol or reading timers.
    const handlers = {};
    const adapter = {
      on: (event, callback) => { handlers[event] = callback; },
      send: data => { if (socket.readyState === 1) socket.send(data); },
      close: () => { socket.close(1000, 'Disconnected'); this.disconnect(socket); }
    };
    this.connections.set(socket, { userId, ip, lease, handlers });
    this.game.connection(adapter, userId, username, ip, request.headers.get('User-Agent'));
    socket.addEventListener('message', event => {
      if (!this.connections.has(socket) || this.game?.sockets[userId] !== adapter) return;
      if (typeof event.data !== 'string' || new TextEncoder().encode(event.data).length > 10240) { socket.close(1009, 'Message too large'); return; }
      handlers.message?.(event.data);
    });
    socket.addEventListener('close', () => this.disconnect(socket));
    socket.addEventListener('error', () => { this.disconnect(socket); socket.close(1011, 'Connection error'); });
    await this.ctx.storage.setAlarm(Date.now() + 60000);
    return response();
  }

  disconnect (socket, dispose = true) {
    const identity = this.connections.get(socket);
    if (!identity) return;
    this.connections.delete(socket);
    identity.handlers.close?.();
    this.ctx.waitUntil(guard(this.env, identity.ip, 'release', { id: identity.lease }));
    if (!this.connections.size && dispose) {
      clearTimeout(this.game.timeoutID);
      clearTimeout(this.game.timeoutId);
      clearInterval(this.game.timer.interval);
      this.game = null;
      this.ctx.waitUntil(this.ctx.storage.deleteAlarm());
    }
  }

  async alarm () {
    for (const [socket, identity] of this.connections) {
      if (socket.readyState !== 1) this.disconnect(socket);
      else if (!await guard(this.env, identity.ip, 'renew', { id: identity.lease })) {
        socket.close(1008, 'Connection limit reached');
        this.disconnect(socket);
      }
    }
    if (this.connections.size) await this.ctx.storage.setAlarm(Date.now() + 60000);
  }
}
