import test from 'node:test';
import assert from 'node:assert/strict';
import QuestionRoom from '../shared/rooms/QuestionRoom.js';
import CategoryManager from '../shared/category-manager.js';
import { MODE_ENUM } from '../shared/constants.js';

test('set selection skips absent packet numbers', async () => {
  const room = new QuestionRoom('test', new CategoryManager(), ['tossups']);
  room.mode = MODE_ENUM.SET_NAME;
  room.query.packetNumbers = [1, 2, 3];
  room.getPacket = async ({ packetNumber }) => ({ tossups: packetNumber === 3 ? [{ number: 11, category: 'Math' }] : [] });
  assert.equal((await room.getNextQuestion('tossups')).number, 11);
  assert.equal(room.query.packetNumbers[0], 3);
});

test('solo local upload accepts one question type and retains source numbers', () => {
  const room = new QuestionRoom('test', new CategoryManager(), ['tossups']);
  room.uploadLocalPacket({ userId: 'user' }, { filename: 'round3.json', packet: { tossups: [{ number: 11, question: 'Which?<br>W) Water', answer: 'W) WATER' }] } });
  const question = room.localPacket.tossups[0];
  assert.equal(question.number, 11);
  assert.equal(question.question_sanitized, 'Which?\nW) Water');
});
