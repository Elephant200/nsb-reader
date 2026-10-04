import test from 'node:test';
import assert from 'node:assert/strict';
import Player from '../shared/Player.js';
import Team from '../shared/Team.js';
import TossupBonusRoom from '../shared/rooms/TossupBonusRoom.js';
import CategoryManager from '../shared/category-manager.js';
import { BONUS_PROGRESS_ENUM, TOSSUP_PROGRESS_ENUM, QUESTION_TYPE_ENUM } from '../shared/constants.js';
import trackSoloStats from '../client/scripts/track-solo-stats.js';

function fixture () {
  const room = new TossupBonusRoom('', new CategoryManager());
  room.players.user = new Player('user');
  room.players.user.teamId = 'user';
  room.teams.user = new Team('user');
  room.sockets.user = { send () {} };
  room.settings.timer = false;
  room.checkAnswer = () => ({ directive: 'accept' });
  room.readTossup = () => {};
  let stats;
  trackSoloStats(room, 'user', value => { stats = value; });
  return { room, get stats () { return stats; } };
}

test('solo scores belong only to the current page instance', async () => {
  const session = fixture();
  const { room } = session;
  room.tossup = { question: 'Name the gas', question_sanitized: 'Name the gas', answer: 'Oxygen' };
  room.questionSplit = ['Name', 'the', 'gas'];
  room.wordIndex = 1;
  room.tossupProgress = TOSSUP_PROGRESS_ENUM.READING;
  room.buzz({ userId: 'user' });
  room.giveTossupAnswer({ userId: 'user' }, { givenAnswer: 'Oxygen' });
  await Promise.resolve();
  assert.equal(session.stats.player.points, 4);
  assert.equal(session.stats.player.tens, 1);
  assert.equal(fixture().room.players.user.points, 0);
  room.clearStats({ userId: 'user' });
  await Promise.resolve();
  assert.equal(session.stats.player.points, 0);
  assert.equal(session.stats.player.tuh, 0);
});

test('an answered bonus displays before Next and is counted only once after Next', async () => {
  const session = fixture();
  const { room } = session;
  room.currentQuestionType = QUESTION_TYPE_ENUM.BONUS;
  room.bonusEligibleTeamId = 'user';
  room.bonus = { _id: 'bonus', leadin: '', parts: ['Gas?'], answers: ['Oxygen'], values: [10] };
  room.currentPartNumber = 0;
  room.bonusProgress = BONUS_PROGRESS_ENUM.READING;
  room.startBonusAnswer({ userId: 'user' });
  room.giveBonusAnswer({ userId: 'user' }, { givenAnswer: 'Oxygen' });
  await Promise.resolve();
  assert.equal(session.stats.bonusStats[10], 1);
  room.toggleBonusPart({ userId: 'user' }, { partNumber: 0, correct: false });
  await Promise.resolve();
  assert.equal(session.stats.bonusStats[0], 1);
  room.endCurrentBonus({ userId: 'user' });
  await Promise.resolve();
  assert.equal(session.stats.bonusStats[0], 1);
  assert.equal(fixture().stats.bonusStats[0], 0);
});
