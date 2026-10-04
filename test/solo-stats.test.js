import test from 'node:test';
import assert from 'node:assert/strict';
import Player from '../shared/Player.js';
import Team from '../shared/Team.js';
import TossupBonusRoom from '../shared/rooms/TossupBonusRoom.js';
import CategoryManager from '../shared/category-manager.js';
import { BONUS_PROGRESS_ENUM, TOSSUP_PROGRESS_ENUM, QUESTION_TYPE_ENUM } from '../shared/constants.js';
import persistSoloStats from '../client/scripts/persist-solo-stats.js';

function fixture (storage, mode = 'all') {
  const room = new TossupBonusRoom('', new CategoryManager());
  room.players.user = new Player('user');
  room.players.user.teamId = 'user';
  room.teams.user = new Team('user');
  room.sockets.user = { send () {} };
  room.settings.timer = false;
  room.checkAnswer = () => ({ directive: 'accept' });
  room.readTossup = () => {};
  const stats = persistSoloStats(room, 'user', mode, storage);
  return { room, stats };
}
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
};

test('solo scores, celerity, and explicit resets survive a new page instance', async () => {
  const storage = memoryStorage();
  const { room } = fixture(storage);
  room.tossup = { question: 'Name the gas', question_sanitized: 'Name the gas', answer: 'Oxygen' };
  room.questionSplit = ['Name', 'the', 'gas'];
  room.wordIndex = 1;
  room.tossupProgress = TOSSUP_PROGRESS_ENUM.READING;
  room.buzz({ userId: 'user' });
  room.giveTossupAnswer({ userId: 'user' }, { givenAnswer: 'Oxygen' });
  await Promise.resolve();
  const restored = fixture(storage).room;
  assert.equal(restored.players.user.points, 4);
  assert.equal(restored.players.user.tens, 1);
  assert.deepEqual(restored.players.user.celerity, room.players.user.celerity);
  restored.clearStats({ userId: 'user' });
  await Promise.resolve();
  assert.equal(fixture(storage).room.players.user.points, 0);
  assert.equal(fixture(storage).room.players.user.tuh, 0);
});

test('an answered bonus persists before Next and is counted only once after Next', async () => {
  const storage = memoryStorage();
  const { room } = fixture(storage, 'bonuses');
  room.currentQuestionType = QUESTION_TYPE_ENUM.BONUS;
  room.bonusEligibleTeamId = 'user';
  room.bonus = { _id: 'bonus', leadin: '', parts: ['Gas?'], answers: ['Oxygen'], values: [10] };
  room.currentPartNumber = 0;
  room.bonusProgress = BONUS_PROGRESS_ENUM.READING;
  room.startBonusAnswer({ userId: 'user' });
  room.giveBonusAnswer({ userId: 'user' }, { givenAnswer: 'Oxygen' });
  await Promise.resolve();
  assert.equal(fixture(storage, 'bonuses').room.teams.user.bonusStats[10], 1);
  room.toggleBonusPart({ userId: 'user' }, { partNumber: 0, correct: false });
  await Promise.resolve();
  assert.equal(fixture(storage, 'bonuses').room.teams.user.bonusStats[0], 1);
  room.endCurrentBonus({ userId: 'user' });
  await Promise.resolve();
  assert.equal(fixture(storage, 'bonuses').room.teams.user.bonusStats[0], 1);
  assert.equal(fixture(storage, 'tossups').room.teams.user.bonusStats[0], 0);
});
