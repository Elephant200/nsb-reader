import test from 'node:test';
import assert from 'node:assert/strict';
import TossupBonusRoom from '../shared/rooms/TossupBonusRoom.js';
import CategoryManager from '../shared/category-manager.js';
import ServerPlayer from '../server/multiplayer/ServerPlayer.js';
import Team from '../shared/Team.js';
import { snapshotMultiplayer, restoreMultiplayer } from '../cloudflare/rooms/multiplayer-snapshot.js';

function room () {
  const game = new TossupBonusRoom('test', new CategoryManager());
  Object.assign(game, { bannedUserList: new Map(), kickedUserList: new Map(), votekickList: [] });
  return game;
}

test('durable snapshots restore question progress, pending answers, teams, and usable player methods', () => {
  const original = room();
  original.players.one = new ServerPlayer('one');
  original.players.one.points = 4;
  original.teams.one = new Team('one');
  original.teams.one.updateStats(10);
  original.tossup = { _id: 'question', question: 'A question' };
  original.wordIndex = 1;
  original.buzzedIn = 'one';
  original.liveAnswer = 'draft';
  original.timer.timeRemaining = 27;
  original.paused = true;
  original.sockets.one = { circular: original };
  const restored = room();
  restoreMultiplayer(restored, snapshotMultiplayer(original));
  assert.deepEqual(restored.tossup, original.tossup);
  assert.equal(restored.wordIndex, 1);
  assert.equal(restored.buzzedIn, 'one');
  assert.equal(restored.liveAnswer, 'draft');
  assert.equal(restored.timer.timeRemaining, 27);
  assert.equal(restored.paused, true);
  assert.equal(restored.teams.one.bonusStats[10], 1);
  assert.deepEqual(restored.sockets, {});
  restored.players.one.clearStats();
  restored.teams.one.clearStats();
  assert.equal(restored.players.one.points, 0);
  assert.equal(restored.teams.one.bonusStats[10], 0);
});
