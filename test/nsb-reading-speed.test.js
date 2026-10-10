import test from 'node:test';
import assert from 'node:assert/strict';
import { readingWordDelay } from '../shared/reading-word-delay.js';
import CategoryManager from '../shared/category-manager.js';
import TossupRoom from '../shared/rooms/TossupRoom.js';
import BonusRoom from '../shared/rooms/BonusRoom.js';
import ServerTossupBonusRoom from '../server/multiplayer/ServerTossupBonusRoom.js';

test('prose keeps its existing pacing and punctuation pauses', () => {
  const factor = 0.9 * (140 - 35);
  assert.equal(readingWordDelay(['hello'], 0, 35), (Math.log(5) + 1) * factor);
  assert.equal(readingWordDelay(['hello,'], 0, 35), (Math.log(6) + 2.5) * factor);
  assert.equal(readingWordDelay(['hello.'], 0, 35), (Math.log(6) + 3.5) * factor);
  assert.equal(readingWordDelay(['(*)'], 0, 35, { skipPowerMarkers: true }), 0);
});

test('equation symbols, variables, and reading words receive slower timing', () => {
  const words = 'x = 2 + y² divided by ½ H₂O 10⁻⁶ x/y squared'.split(' ');
  for (const index of [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11]) {
    const expected = Math.max(Math.log(words[index].length) + 1, 2.5) * 2 * 0.9 * (140 - 35);
    assert.equal(readingWordDelay(words, index, 35), expected, words[index]);
  }
  assert.ok(readingWordDelay(['squared'], 0, 35) > readingWordDelay(['squared'], 0, 50));
  for (const word of ['→', '⇌', '∂', '∝', 'log', 'half', 'thirds', 'fifth', 'xʸ', 'aₙ', 'mₛ']) {
    const expected = Math.max(Math.log(word.length) + 1, 2.5) * 2 * 0.9 * (140 - 35);
    assert.equal(readingWordDelay([word], 0, 35), expected, word);
  }
});

test('solo and multiplayer defaults and actual word scheduling agree', t => {
  const scheduled = [];
  t.mock.method(Date, 'now', () => 1000);
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    scheduled.push({ callback, delay });
    return 1;
  });
  const rooms = [
    new TossupRoom('solo', new CategoryManager(), ['tossups']),
    new BonusRoom('bonus', new CategoryManager(), ['bonuses']),
    new ServerTossupBonusRoom('multiplayer', 'owner', false, new CategoryManager())
  ];
  for (const room of rooms) {
    if (room.cleanupInterval) clearInterval(room.cleanupInterval);
    assert.equal(room.settings.readingSpeed, 35);
    const messages = [];
    room.emitMessage = message => messages.push(message);
    const words = ['x', '=', '2'];
    if (room.readTossup) {
      room.tossup = { question_sanitized: words.join(' ') };
      room.questionSplit = words;
      room.wordIndex = 0;
      room.readTossup(1000);
      assert.equal(messages.at(-1).word, 'x');
      assert.equal(scheduled.at(-1).delay, readingWordDelay(words, 0, 35));
    }
    if (room.startReadingBonusText) {
      room.startReadingBonusText(words.join(' '), () => {});
      assert.equal(messages.at(-1).word, 'x');
      assert.equal(scheduled.at(-1).delay, readingWordDelay(words, 0, 35));
    }
  }
});
