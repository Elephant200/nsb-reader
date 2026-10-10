import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareImportPlan } from '../../../tools/import/import-corpus.js';

const SOURCE_URL = 'https://science.osti.gov/-/media/wdts/nsb/pdf/HS-Sample-Questions/Sample-Set-1/round3.pdf';

function tossup (number) {
  return { number, question: 'Bad extraction', answer: '7', category: 'Math', type: 'Short Answer', options: [] };
}

function bonus (number) {
  return { number, leadin: '', parts: ['Bad extraction'], answers: ['Bad extraction'], category: 'Math', values: [10], type: 'Short Answer', options: [] };
}

test('import plan applies source-keyed math corrections to the matching PDF packet', () => {
  const { plan } = prepareImportPlan({
    packets: [{
      source: { setNumber: 1, year: 2009, roundNumber: 3, filename: 'round3.pdf', url: SOURCE_URL, supplemental: false },
      tossups: [tossup(11), tossup(18)],
      bonuses: [bonus(11), bonus(18)]
    }]
  });

  assert.equal(plan.length, 1);
  const { data } = plan[0];
  assert.equal(data.tossups[0].question, 'Giving your answer as a proper fraction, what is the cube root of <span class="nsb-fraction"><span>125</span><span>343</span></span>?');
  assert.equal(data.tossups[0].question_sanitized, 'Giving your answer as a proper fraction, what is the cube root of (125)/(343)?');
  assert.equal(data.tossups[0].answer, '5/7');
  assert.equal(data.tossups[0].answer_sanitized, '5/7');
  assert.equal(data.bonuses[0].parts[0], 'Find the following product, giving your answer in standard form: (4x<sup>3</sup> + x)(7x<sup>3</sup> + 4x<sup>2</sup>)');
  assert.equal(data.bonuses[0].parts_sanitized[0], 'Find the following product, giving your answer in standard form: (4x³ + x)(7x³ + 4x²)');
  assert.equal(data.bonuses[0].answers_sanitized[0], '28x⁶ + 16x⁵ + 7x⁴ + 4x³ (ACCEPT: x³(28x³ + 16x² + 7x + 4))');
  assert.equal(data.bonuses[0].leadin, '');
  assert.equal(data.bonuses[0].leadin_sanitized, '');
  assert.equal(data.bonuses[1].parts[0], 'Simplify the following rational expression by combining like terms, assuming x is not equal to 4: <span class="nsb-fraction"><span>x<sup>2</sup> − 16</span><span>4x − x<sup>2</sup></span></span>');
  assert.equal(data.bonuses[1].parts_sanitized[0], 'Simplify the following rational expression by combining like terms, assuming x is not equal to 4: (x^2 − 16)/(4x − x^2)');
  assert.equal(data.bonuses[1].answers[0], '−<span class="nsb-fraction"><span>x + 4</span><span>x</span></span> (ACCEPT: <span class="nsb-fraction"><span>x + 4</span><span>−x</span></span> or −(x + 4)/x or (−x − 4)/x)');
  assert.equal(data.bonuses[1].answers_sanitized[0], '−(x + 4)/(x) (ACCEPT: (x + 4)/(−x) or −(x + 4)/x or (−x − 4)/x)');
  assert.equal(data.bonuses[1].leadin, '');
  assert.equal(data.bonuses[1].leadin_sanitized, '');
});

test('source-keyed math corrections do not affect other PDFs with the same packet number', () => {
  const { plan } = prepareImportPlan({
    packets: [{
      source: { setNumber: 2, year: 2012, roundNumber: 3, filename: 'round3.pdf', url: 'https://example.com/round3.pdf', supplemental: false },
      tossups: [tossup(11)],
      bonuses: [bonus(11)]
    }]
  });

  assert.equal(plan[0].data.tossups[0].question, 'Bad extraction');
  assert.equal(plan[0].data.bonuses[0].parts[0], 'Bad extraction');
});
