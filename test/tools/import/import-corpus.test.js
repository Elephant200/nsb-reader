import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareImportPlan } from '../../../tools/import/import-corpus.js';

function tossup (number, answer = 'Answer', overrides = {}) {
  return {
    number,
    question: 'Question',
    answer,
    category: 'Physics',
    type: 'Short Answer',
    options: [],
    ...overrides
  };
}

function bonus (number, answer = 'Answer', overrides = {}) {
  return {
    number,
    leadin: '',
    parts: ['Question'],
    answers: [answer],
    category: 'Physics',
    values: [10],
    type: 'Short Answer',
    options: [],
    ...overrides
  };
}

test('prepareImportPlan keeps valid pairs and drops incomplete, duplicate, and informational records', () => {
  const result = prepareImportPlan({
    packets: [
      {
        source: { setNumber: 3, year: 2007, roundNumber: 2, filename: 'round2.pdf', supplemental: false },
        tossups: [tossup(1), tossup(2, ''), tossup(3), tossup(3)],
        bonuses: [bonus(1), bonus(2), bonus(3)]
      },
      {
        source: { setNumber: 3, year: 2007, roundNumber: null, filename: 'Energy-Category.pdf', supplemental: true },
        tossups: [],
        bonuses: []
      }
    ]
  });

  assert.equal(result.plan.length, 1);
  assert.deepEqual(result.plan[0].data.tossups.map(item => item.number), [1]);
  assert.deepEqual(result.plan[0].data.bonuses.map(item => item.number), [1]);
  assert.equal(result.plan[0].setName, '2007 NSB Sample Set 3');
  assert.deepEqual(result.skipped, { supplemental: 1, tossups: 3, bonuses: 2, pairs: 2 });
});

test('prepareImportPlan drops MC pairs with malformed options or answer mismatches', () => {
  const toss = tossup(4, 'X) WRONG', {
    type: 'Multiple Choice',
    options: ['W) A', 'X) B', 'Y) C', 'Z) D'],
    validationErrors: ['Multiple-choice answer text for X in question 4 does not match the extracted option']
  });
  const result = prepareImportPlan({
    packets: [{
      source: { setNumber: 10, year: 2016, roundNumber: 1, filename: 'round1.pdf', supplemental: false },
      tossups: [toss],
      bonuses: [bonus(4)]
    }]
  });
  assert.equal(result.plan.length, 0);
  assert.equal(result.skipped.pairs, 1);
});
