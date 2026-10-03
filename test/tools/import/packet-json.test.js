import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePacketJson } from '../../../tools/import/packet-json.js';

test('normalizePacketJson converts parsed packet JSON into validated import rows', () => {
  const packet = normalizePacketJson({
    setName: '2026 NSB Regionals',
    packetName: 'Round 1',
    packetNumber: 1,
    difficulty: 3,
    standard: true,
    data: {
      tossups: [{
        question: '  This is a tossup.  ',
        question_sanitized: 'This is a tossup.',
        answer: '<b>Answer</b>',
        answer_sanitized: 'Answer',
        category: 'Physics'
      }],
      bonuses: [{
        leadin: 'Bonus leadin',
        leadin_sanitized: 'Bonus leadin',
        parts: ['Part A'],
        parts_sanitized: ['Part A'],
        answers: ['Answer A'],
        answers_sanitized: ['Answer A'],
        category: 'Chemistry',
        values: [10]
      }]
    }
  });

  assert.equal(packet.set.year, 2026);
  assert.equal(packet.tossups[0].number, 1);
  assert.equal(packet.tossups[0].question, 'This is a tossup.');
  assert.deepEqual(packet.bonuses[0].values, [10]);
});

test('normalizePacketJson reports missing required fields', () => {
  assert.throws(() => normalizePacketJson({
    setName: '2026 NSB Regionals',
    packetName: 'Round 1',
    packetNumber: 1,
    difficulty: 3,
    data: { tossups: [{ answer: 'missing question' }], bonuses: [] }
  }), /tossup 1 missing question/);
});

test('normalizePacketJson preserves source question numbers and leaves unknown years unknown', () => {
  const packet = normalizePacketJson({
    setName: 'Sample Set 3',
    packetName: 'Round 1',
    packetNumber: 1,
    difficulty: 0,
    data: {
      tossups: [{ number: 7, question: 'Question<br>W) a<br>X) b<br>Y) c<br>Z) d', answer: 'W', category: 'Physics' }],
      bonuses: [{ number: 7, leadin: '', parts: ['x<span class="nsb-fraction"><span>125</span><span>343</span></span><sup>3</sup>'], answers: ['Answer'], category: 'Physics', values: [10] }]
    }
  });
  assert.equal(packet.set.year, null);
  assert.equal(packet.tossups[0].number, 7);
  assert.equal(packet.bonuses[0].number, 7);
  assert.equal(packet.tossups[0].question, 'Question<br>W) a<br>X) b<br>Y) c<br>Z) d');
  assert.equal(packet.tossups[0].question_sanitized, 'Question\nW) a\nX) b\nY) c\nZ) d');
  assert.equal(packet.bonuses[0].parts_sanitized[0], 'x(125)/(343)³');
});

test('sanitized text retains mathematical comparison signs as text', () => {
  const packet = normalizePacketJson({
    setName: 'Sample Set 3',
    packetName: 'Round 1',
    packetNumber: 1,
    difficulty: 0,
    data: {
      tossups: [{ number: 1, question: 'Is x &lt; 3 and y &gt; 5?', answer: 'x &lt; 3', category: 'Math' }],
      bonuses: [{ number: 1, leadin: '', parts: ['x &lt; 3 and y &gt; 5'], answers: ['true'], category: 'Math' }]
    }
  });
  assert.equal(packet.tossups[0].question_sanitized, 'Is x < 3 and y > 5?');
  assert.equal(packet.bonuses[0].parts_sanitized[0], 'x < 3 and y > 5');
});
