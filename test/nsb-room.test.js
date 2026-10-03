import test from 'node:test';
import assert from 'node:assert/strict';
import ServerTossupBonusRoom from '../server/multiplayer/ServerTossupBonusRoom.js';
import CategoryManager from '../shared/category-manager.js';
import Player from '../shared/Player.js';
import Team from '../shared/Team.js';
import { BONUS_PROGRESS_ENUM, QUESTION_TYPE_ENUM, TOSSUP_PROGRESS_ENUM } from '../shared/constants.js';

function roomFixture () {
  const room = new ServerTossupBonusRoom('practice', 'a', false, new CategoryManager());
  clearInterval(room.cleanupInterval);
  room.settings.timer = false;
  room.settings.public = false;
  room.readTossup = () => {};
  for (const id of ['a', 'b', 'c']) {
    room.players[id] = new Player(id);
    room.players[id].teamId = id;
    room.players[id].online = true;
    room.teams[id] = new Team(id);
    room.sockets[id] = { send () {} };
  }
  room.tossup = { _id: 'question', number: 4, question: 'What gas is this?', question_sanitized: 'What gas is this?', answer: 'W) OXYGEN', packet: { _id: 'packet' } };
  room.questionSplit = ['What', 'gas', 'is', 'this?'];
  room.wordIndex = 2;
  room.tossupProgress = TOSSUP_PROGRESS_ENUM.READING;
  return room;
}

test('free-for-all admits one buzzer, scores interrupts, and locks out that player', () => {
  const room = roomFixture();
  room.buzz({ userId: 'a' });
  room.buzz({ userId: 'b' });
  assert.equal(room.buzzedIn, 'a');
  room.giveTossupAnswer({ userId: 'a' }, { givenAnswer: 'X' });
  assert.equal(room.players.a.points, -4);
  room.buzz({ userId: 'a' });
  assert.equal(room.buzzedIn, null);
  room.buzz({ userId: 'b' });
  room.giveTossupAnswer({ userId: 'b' }, { givenAnswer: 'oxygen' });
  assert.equal(room.players.b.points, 4);
  assert.equal(room.players.b.tens, 1);
  assert.equal(room.bonusEligibleTeamId, 'b');
});

test('a fully read miss scores zero and a host correction restores four points', () => {
  const room = roomFixture();
  room.wordIndex = room.questionSplit.length;
  room.buzz({ userId: 'b' });
  room.giveTossupAnswer({ userId: 'b' }, { givenAnswer: 'X' });
  assert.equal(room.players.b.points, 0);
  room.toggleCorrect({ userId: 'a' }, { targetUserId: 'b' });
  assert.equal(room.players.b.points, 4);
  assert.equal(room.players.b.zeroes, 0);
  assert.equal(room.bonusEligibleTeamId, 'b');
});

test('only the eligible player may answer a bonus, and repeated submissions do not score', () => {
  const room = roomFixture();
  room.currentQuestionType = QUESTION_TYPE_ENUM.BONUS;
  room.bonusEligibleTeamId = 'b';
  room.bonusProgress = BONUS_PROGRESS_ENUM.READING;
  room.bonus = { parts: ['Gas?'], answers: ['W) OXYGEN'], values: [10] };
  room.currentPartNumber = 0;
  room.startBonusAnswer({ userId: 'b' });
  room.giveBonusAnswer({ userId: 'c' }, { givenAnswer: 'W' });
  assert.deepEqual(room.pointsPerPart, []);
  room.giveBonusAnswer({ userId: 'b' }, { givenAnswer: 'W' });
  room.giveBonusAnswer({ userId: 'b' }, { givenAnswer: 'W' });
  assert.deepEqual(room.pointsPerPart, [10]);
});

test('paired bonus lookup uses the current tossup rather than random bonus order', async () => {
  const room = roomFixture();
  room.getPairedBonus = async (packet, number) => ({ packet, number });
  assert.deepEqual(await room.getNextQuestion('bonuses'), { packet: 'packet', number: 4 });
});

test('room controls require ownership and ownership can be transferred', async () => {
  const room = roomFixture();
  await room.message({ userId: 'b' }, { type: 'toggle-enable-bonuses', enableBonuses: true });
  assert.equal(room.settings.enableBonuses, false);
  await room.message({ userId: 'a' }, { type: 'transfer-owner', targetId: 'b' });
  assert.equal(room.ownerId, 'b');
  await room.message({ userId: 'b' }, { type: 'toggle-enable-bonuses', enableBonuses: true });
  assert.equal(room.settings.enableBonuses, true);
});
