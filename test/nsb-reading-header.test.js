import test from 'node:test';
import assert from 'node:assert/strict';
import { questionReadingHeader, withTossupReadingHeader, withBonusReadingHeader } from '../shared/question-reading-header.js';

test('the reading header identifies category and answer format', () => {
  assert.equal(questionReadingHeader('Math', 'What is 2 + 2?', '4'), 'Math — Short Answer.');
  assert.equal(questionReadingHeader('Physics', 'Which?<br>W) speed<br>X) time', 'W) SPEED'), 'Physics — Multiple Choice.');
});

test('headers precede the prompt without changing source questions or pairing', () => {
  const tossup = { number: 11, category: 'Math', question: 'Calculate 2 + 2.', question_sanitized: 'Calculate 2 + 2.', answer: '4' };
  const reading = withTossupReadingHeader(tossup);
  assert.equal(reading.question_sanitized, 'Math — Short Answer.\nCalculate 2 + 2.');
  assert.equal(reading.number, 11);
  assert.equal(tossup.question, 'Calculate 2 + 2.');
  const bonus = withBonusReadingHeader({ category: 'Chemistry', parts: ['Which element?'], parts_sanitized: ['Which element?'], answers: ['X) OXYGEN'] });
  assert.equal(bonus.parts[0], 'Chemistry — Multiple Choice.<br>Which element?');
});
