import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import checkShortAnswer from 'qb-answer-checker';
import { createNsbAnswerChecker } from '../shared/nsb-check-answer.js';
import { scienceText } from '../shared/normalize-science-answer.js';
import stripAnswerReadingCues from '../shared/strip-answer-reading-cues.js';

test('corpus multiple-choice options accept their full text and reject contradictory labels', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../data/nsb/sample-questions.json', import.meta.url), 'utf8'));
  const check = createNsbAnswerChecker(checkShortAnswer);
  let checked = 0;
  for (const [packetIndex, packet] of corpus.packets.entries()) {
    for (const kind of ['tossups', 'bonuses']) {
      for (const item of packet[kind]) {
        const answer = item.answer ?? item.answers[0];
        const letter = answer.match(/^([WXYZ])\)/)?.[1];
        if (!letter) continue;
        const question = item.question ?? item.parts[0];
        for (const option of item.options ?? []) {
          const label = option.match(/^([WXYZ])\)/)?.[1];
          const body = scienceText(stripAnswerReadingCues(option.slice(2)));
          if (!label || !body) continue;
          const correct = label === letter;
          const response = correct ? body : label + ') ' + body;
          assert.equal(check(answer, response, 7, question).directive, correct ? 'accept' : 'reject', `Packet ${packetIndex}, ${kind} ${item.number}, ${response}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 19000, 'The check must cover the full corpus of multiple-choice options.');
});
