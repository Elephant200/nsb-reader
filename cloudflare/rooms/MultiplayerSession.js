/* global WebSocketPair, Response, crypto */
import ServerTossupBonusRoom from '../../server/multiplayer/ServerTossupBonusRoom.js';
import CategoryManager from '../../shared/category-manager.js';
import getRandomName from '../../shared/get-random-name.js';
import isAppropriateString from '../../server/moderation/is-appropriate-string.js';
import Questions from '../database/questions.js';
import { guard } from './TrafficGuard.js';
import { snapshotMultiplayer, restoreMultiplayer } from './multiplayer-snapshot.js';
import { QUESTION_TYPE_ENUM, TOSSUP_PROGRESS_ENUM, BONUS_PROGRESS_ENUM } from '../../shared/constants.js';

/** Runs the shared word-reading engine in one Object for each private room. */
export class MultiplayerSession {
  constructor (ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.connections = new Map();
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS multiplayer_state (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL, empty_since INTEGER)');
    this.saved = ctx.storage.sql.exec('SELECT data, empty_since FROM multiplayer_state WHERE id = 1').toArray()[0];
    this.emptySince = this.saved?.empty_since || null;
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
      if (this.saved) { restoreMultiplayer(this.game, this.saved.data); this.needsResume = true; }
      const emit = this.game.emitMessage.bind(this.game);
      this.game.emitMessage = message => {
        emit(message);
        // Persist after the engine finishes the current synchronous state transition.
        if (message.type !== 'chat-live-update' && (message.type !== 'timer-update' || message.timeRemaining % 10 === 0)) {
          queueMicrotask(() => this.save());
        }
      };
      const db = new Questions(this.env.DB);
      this.game.getPacket = params => db.packet(params);
      this.game.getPacketCount = setName => db.packetCount(setName);
      this.game.getRandomTossups = params => db.random('tossup', params);
      this.game.getRandomBonuses = params => db.random('bonus', params);
      this.game.getPairedBonus = (packetId, number) => db.pairedBonus(packetId, number);
      this.game.getSetList = () => db.sets();
    }
    if (this.game.settings.lock && !this.game.players[userId]) return fail('The room is locked.');
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
      send: data => {
        if (joining && this.game.currentQuestionType === QUESTION_TYPE_ENUM.BONUS && this.game.settings.readBonusLikeATossup && this.game.bonusProgress === BONUS_PROGRESS_ENUM.READING) {
          const message = JSON.parse(data);
          const partial = this.game.bonusQuestionSplit.slice(0, this.game.bonusWordIndex).join(' ');
          if (message.type === 'reveal-next-part' && message.currentPartNumber === this.game.currentPartNumber) message.part = partial;
          if (message.type === 'reveal-leadin' && this.game.currentPartNumber < 0) message.leadin = partial;
          data = JSON.stringify(message);
        }
        if (socket.readyState === 1) socket.send(data);
      },
      close: () => { socket.close(1000, 'Disconnected'); this.disconnect(socket); }
    };
    this.connections.set(socket, { userId, ip, lease, handlers });
    const resume = this.needsResume || !!this.emptySince;
    this.needsResume = false;
    this.emptySince = null;
    let joining = true;
    this.game.connection(adapter, userId, username, ip, request.headers.get('User-Agent'));
    joining = false;
    adapter.send(JSON.stringify({ type: 'timer-update', timeRemaining: this.game.timer.timeRemaining }));
    const answerer = this.game.buzzedIn || this.game.bonusAnswerer;
    if (answerer) adapter.send(JSON.stringify({ type: this.game.buzzedIn ? 'buzz' : 'start-bonus-answer', userId: answerer, username: this.game.players[answerer].username }));
    if (resume) this.resume();
    socket.addEventListener('message', event => {
      if (!this.connections.has(socket) || this.game?.sockets[userId] !== adapter) return;
      if (typeof event.data !== 'string' || new TextEncoder().encode(event.data).length > 10240) { socket.close(1009, 'Message too large'); return; }
      handlers.message?.(event.data);
    });
    socket.addEventListener('close', () => this.disconnect(socket));
    socket.addEventListener('error', () => { this.disconnect(socket); socket.close(1011, 'Connection error'); });
    await this.ctx.storage.setAlarm(Date.now() + 60000);
    this.save();
    return response();
  }

  disconnect (socket, dispose = true) {
    const identity = this.connections.get(socket);
    if (!identity) return;
    this.connections.delete(socket);
    this.game.leave(identity.userId);
    this.game.players[identity.userId].online = false;
    this.ctx.waitUntil(guard(this.env, identity.ip, 'release', { id: identity.lease }));
    if (!this.connections.size && dispose) {
      clearTimeout(this.game.timeoutID);
      clearTimeout(this.game.timeoutId);
      clearInterval(this.game.timer.interval);
      this.emptySince = Date.now();
      this.save();
      this.ctx.waitUntil(this.ctx.storage.setAlarm(this.emptySince + 3600000));
    }
  }

  save () {
    if (!this.game) return;
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO multiplayer_state (id, data, empty_since) VALUES (1, ?, ?)', snapshotMultiplayer(this.game), this.emptySince);
  }

  resume () {
    const game = this.game;
    const userId = game.buzzedIn || game.bonusAnswerer;
    if (userId) {
      game.startServerTimer(game.timer.timeRemaining,
        timeRemaining => game.emitMessage({ type: 'timer-update', timeRemaining }),
        () => game.giveAnswer({ userId, username: game.players[userId].username }, { givenAnswer: game.liveAnswer }));
    } else if (!game.paused && game.currentQuestionType === QUESTION_TYPE_ENUM.TOSSUP && game.tossupProgress === TOSSUP_PROGRESS_ENUM.READING) {
      if (game.wordIndex >= game.questionSplit.length || game.stopOnPowerEnded) {
        game.startServerTimer(game.timer.timeRemaining,
          timeRemaining => game.emitMessage({ type: 'timer-update', timeRemaining }),
          () => game.revealTossupAnswer());
      } else game.readTossup(Date.now());
    } else if (game.currentQuestionType === QUESTION_TYPE_ENUM.BONUS && game.bonusProgress === BONUS_PROGRESS_ENUM.READING && game.settings.readBonusLikeATossup) {
      game.readBonusWord(Date.now(), () => { if (game.currentPartNumber < 0) game.revealNextPart(); });
    }
  }

  async alarm () {
    if (this.emptySince && Date.now() - this.emptySince >= 3600000) {
      this.save();
      this.saved = this.ctx.storage.sql.exec('SELECT data, empty_since FROM multiplayer_state WHERE id = 1').toArray()[0];
      this.game = null;
      return;
    }
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
