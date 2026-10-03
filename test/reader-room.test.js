import assert from 'node:assert/strict';
import test from 'node:test';
import ReaderRoom from '../shared/rooms/ReaderRoom.js';

function room () {
  const game = new ReaderRoom();
  game.join('a', 'bright-otter');
  game.join('b', 'calm-owl');
  game.join('c', 'clever-cat');
  game.load({ tossup: { _id: 'question-1', question: 'Private prompt', answer: 'Private answer' }, bonus: { parts: ['Private bonus'], answers: ['Secret'] } });
  return game;
}

test('only the first eligible buzz wins; player state contains no reader data', () => {
  const game = room();
  assert.equal(game.buzz('a'), true);
  assert.equal(game.buzz('b'), false);
  assert.equal(game.pending.interrupt, true);
  assert.deepEqual(Object.keys(game.playerView('a', true)).sort(), ['buzzed', 'canBuzz', 'readerOnline', 'role', 'team', 'title', 'type', 'username'].sort());
  assert.equal(game.playerView('b', false).canBuzz, false);
  assert.equal(game.players.b.buzzes, 0);
});

test('reader judgments score interruptions and allow correction without duplication', () => {
  const game = room();
  game.buzz('a');
  game.action({ type: 'judge', correct: false, interrupt: true });
  assert.deepEqual(game.scores, [0, 4]);
  assert.equal(game.needsQuestion(), true);
  game.action({ type: 'judge', correct: true, interrupt: false });
  assert.deepEqual(game.scores, [4, 0]);
  assert.equal(game.players.a.misses, 0);
  assert.equal(game.players.a.interrupts, 0);
  assert.equal(game.players.a.correct, 1);
  assert.equal(game.nextBonus(), true);
  assert.equal(game.canBuzz('a'), false);
  game.action({ type: 'judge', correct: true });
  game.action({ type: 'judge', correct: true });
  assert.deepEqual(game.scores, [14, 0]);
  game.action({ type: 'judge', correct: false });
  assert.deepEqual(game.scores, [4, 0]);
  assert.deepEqual(game.bonuses[0], { correct: 0, misses: 1 });
});

test('timed buzzes are not interruptions; paused and expired timers block buzzes', () => {
  const game = room();
  game.action({ type: 'start-timer' });
  game.buzz('b');
  assert.equal(game.pending.interrupt, false);
  game.action({ type: 'judge', correct: false });
  assert.deepEqual(game.scores, [0, 0]);
  game.load({ tossup: { _id: '2' }, bonus: null });
  game.action({ type: 'pause-timer' });
  assert.equal(game.canBuzz('a'), false);
  game.action({ type: 'reset-timer' });
  assert.equal(game.canBuzz('a'), true);
  game.action({ type: 'start-timer' });
  game.timer.deadline = Date.now() - 1;
  assert.equal(game.canBuzz('a'), false);
  assert.equal(game.result, null);
});

test('roster insertions move identities and stats while balancing new arrivals', () => {
  const game = room();
  assert.deepEqual(game.teams, [['a', 'c'], ['b']]);
  game.players.c.correct = 3;
  game.move('c', 0, 0);
  assert.deepEqual(game.teams[0], ['c', 'a']);
  assert.equal(game.assignment('c').title, 'A Captain');
  game.move('c', 1, 0);
  assert.deepEqual(game.teams, [['a'], ['c', 'b']]);
  assert.equal(game.players.c.correct, 3);
  game.join('d', 'new-player');
  assert.deepEqual(game.teams[0], ['a', 'd']);
  game.buzz('c');
  assert.equal(game.move('c', 0, 0), false);
});

test('an unresolved buzz cannot be skipped or automatically judged', () => {
  const game = room();
  assert.equal(game.action({ type: 'judge', correct: true }), false);
  game.buzz('a');
  assert.equal(game.action({ type: 'no-answer' }), false);
  assert.equal(game.load({ tossup: {} }), false);
  assert.equal(game.nextBonus(), false);
});
