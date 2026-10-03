import assert from 'node:assert/strict';
import test from 'node:test';

import { parseText, reconstructBboxText } from '../../../tools/import/parse-nsb-pdf.js';

test('parseText preserves numbered toss-up/bonus pairs, annotations, and line-separated choices', () => {
  const input = `
TOSS-UP
1) PHYSICS Multiple Choice Which one is correct?
W) First choice
X) Second choice
Y) Third choice
Z) Fourth choice
ANSWER: X) SECOND CHOICE (ACCEPT: X)
BONUS
1) MATH Short Answer Evaluate 2 + 2.
ANSWER. 4 (ACCEPT: FOUR)
`;
  const parsed = parseText(input);
  assert.deepEqual(parsed.diagnostics.errors, []);
  assert.equal(parsed.tossups[0].number, 1);
  assert.equal(parsed.bonuses[0].number, 1);
  assert.equal(parsed.tossups[0].category, 'Physics');
  assert.equal(parsed.tossups[0].question, 'Which one is correct?<br>W) First choice<br>X) Second choice<br>Y) Third choice<br>Z) Fourth choice');
  assert.deepEqual(parsed.tossups[0].options, ['W) First choice', 'X) Second choice', 'Y) Third choice', 'Z) Fourth choice']);
  assert.equal(parsed.tossups[0].answer, 'X) SECOND CHOICE (ACCEPT: X)');
  assert.equal(parsed.bonuses[0].answer, '4 (ACCEPT: FOUR)');
});

test('parseText reports incomplete and malformed questions instead of silently discarding them', () => {
  const parsed = parseText(`
TOSS-UP
7) Chemistry Multiple Choice A broken question
W) Only one option
ANSWER: W
BONUS
7) Chemistry Short Answer Missing an answer
`);
  assert.equal(parsed.tossups.length, 1);
  assert.equal(parsed.bonuses.length, 1);
  assert.match(parsed.bonuses[0].question, /Missing an answer/);
  assert.match(parsed.diagnostics.errors.join('\n'), /options W/);
  assert.match(parsed.diagnostics.errors.join('\n'), /has no answer/);
});

test('parseText recognizes the modern en-dash category/type heading and solution note', () => {
  const parsed = parseText(`
TOSS-UP
1) Earth and Space — Short Answer Name the object.
ANSWER: comet
BONUS
1) Earth and Space — Short Answer Find x.
ANSWER: 2
(Solution: x = 2)
`);
  assert.deepEqual(parsed.diagnostics.errors, []);
  assert.equal(parsed.tossups[0].category, 'Earth and Space');
  assert.deepEqual(parsed.bonuses[0].notes, ['(Solution: x = 2)']);
});

test('parseText accepts source heading variants and normalizes question type', () => {
  const parsed = parseText(`
TOSS-UP
1) ENERGY – Muliple Choice Which answer?
W) one
X) two
Y) three
Z) four
ANSWER: X
BONUS
1) ENERGY Short What is the answer?
ANSWER: answer
`);
  assert.deepEqual(parsed.diagnostics.errors, []);
  assert.equal(parsed.tossups[0].type, 'Multiple Choice');
  assert.equal(parsed.tossups[0].answer, 'X) two');
  assert.equal(parsed.bonuses[0].type, 'Short Answer');
});

test('bbox reconstruction keeps stacked fractions and superscript math', () => {
  const bbox = `<doc><page>
    <word xMin="10" yMin="10" xMax="20" yMax="18">125</word>
    <word xMin="10" yMin="28" xMax="20" yMax="36">343</word>
    <word xMin="30" yMin="40" xMax="36" yMax="48">x</word>
    <word xMin="36" yMin="37" xMax="40" yMax="44">3</word>
  </page></doc>`;
  const text = reconstructBboxText(bbox);
  assert.match(text, /<span class="nsb-fraction"><span>125<\/span><span>343<\/span><\/span>/);
  assert.match(text, /x<sup>3<\/sup>/);
});

test('multiple-choice answer text annotations are preserved without requiring prose equality', () => {
  const parsed = parseText(`
TOSS-UP
1) Biology Multiple Choice Which one?
W) likely
X) very likely
Y) possible
Z) unlikely
ANSWER: W) very likely (ACCEPT: likely)
BONUS
1) Biology Short Answer Name an organism.
ANSWER: organism`);
  assert.deepEqual(parsed.diagnostics.errors, []);
  assert.equal(parsed.tossups[0].answer, 'W) very likely (ACCEPT: likely)');
});

test('rich text escapes PDF comparison signs while preserving explicit math tags', () => {
  const parsed = parseText(`
TOSS-UP
1) MATH Short Answer Is x < 3 and y > 5?
ANSWER: x < 3
BONUS
1) MATH Short Answer Evaluate x<sup>2</sup>.
ANSWER: 4`);
  assert.equal(parsed.tossups[0].question, 'Is x &lt; 3 and y &gt; 5?');
  assert.equal(parsed.tossups[0].answer, 'x &lt; 3');
  assert.equal(parsed.bonuses[0].question, 'Evaluate x<sup>2</sup>.');
});
