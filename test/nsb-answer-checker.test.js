import test from 'node:test';
import assert from 'node:assert/strict';
import checkShortAnswer from 'qb-answer-checker';
import { createNsbAnswerChecker } from '../shared/nsb-check-answer.js';

const check = createNsbAnswerChecker(checkShortAnswer);
test('multiple choice accepts a letter or full choice, and rejects contradictory pairs', () => {
  const key = 'W) CARBON DIOXIDE';
  for (const answer of ['w', 'W)', 'carbon dioxide', 'W) carbon dioxide', 'W carbon dioxide']) {
    assert.equal(check(key, answer).directive, 'accept', answer);
  }
  for (const answer of ['x', 'carbon', 'X) carbon dioxide', 'W) oxygen', '', 'W or X']) {
    assert.equal(check(key, answer).directive, 'reject', answer);
  }
});
test('multiple choice does not use fuzzy matching or strip mathematical signs', () => {
  assert.equal(check('X) -2', '2').directive, 'reject');
  assert.equal(check('X) -2', '-2').directive, 'accept');
  assert.equal(check('Z) SODIUM', 'sodum').directive, 'reject');
});
test('short answers retain answerline acceptance instructions', () => {
  assert.equal(check('MITOCHONDRION (ACCEPT: MITOCHONDRIA)', 'mitochondria').directive, 'accept');
  assert.equal(check('oxygen', '').directive, 'reject');
});

test('numeric answers keep fraction denominators and signs', () => {
  assert.equal(check('7/5', '7').directive, 'reject');
  assert.equal(check('7/5', '7 / 5').directive, 'accept');
  assert.equal(check('7/5', '7⁄5').directive, 'accept');
  assert.equal(check('-2', '2').directive, 'reject');
});

test('multiple choice accepts the displayed option when the answer key abbreviates it', () => {
  const question = 'Which?\nW) sodium chloride\nX) magnesium oxide\nY) calcium oxide\nZ) water';
  assert.equal(check('W) NaCl', 'sodium chloride', 7, question).directive, 'accept');
  assert.equal(check('W) NaCl', 'X sodium chloride', 7, question).directive, 'reject');
});
