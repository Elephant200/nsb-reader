import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQuestionFilters,
  mapBonusRow,
  mapTossupRow
} from '../../../database/qbreader/sql.js';

test('buildQuestionFilters returns parameterized SQL for category and year filters', () => {
  const filters = buildQuestionFilters({
    categories: ['Physics'],
    minYear: 2020,
    maxYear: 2024
  });

  assert.match(filters.whereSql, /q\.category = any\(\$\d+\)/);
  assert.match(filters.whereSql, /s\.year >= \$\d+/);
  assert.match(filters.whereSql, /s\.year <= \$\d+/);
  assert.equal(filters.whereSql.includes('standard'), false);
  assert.deepEqual(filters.values, [
    ['Physics'],
    2020,
    2024
  ]);
});

test('mapTossupRow preserves the public API question shape without Mongo ObjectIds', () => {
  const row = {
    id: '5f0a7a22-0b8e-47fd-9b90-86d54be0929d',
    number: 7,
    question: 'Question text',
    question_sanitized: 'question text',
    answer: '<b>Answer</b>',
    answer_sanitized: 'Answer',
    category: 'Physics',
    difficulty: 3,
    created_at: new Date('2026-01-02T03:04:05.000Z'),
    updated_at: new Date('2026-01-03T03:04:05.000Z'),
    packet_id: 'packet-id',
    packet_name: 'Round 1',
    packet_number: 1,
    set_id: 'set-id',
    set_name: '2026 NSB Regionals',
    set_year: 2026,
    set_standard: true
  };

  assert.deepEqual(mapTossupRow(row), {
    _id: row.id,
    number: 7,
    question: 'Question text',
    question_sanitized: 'question text',
    answer: '<b>Answer</b>',
    answer_sanitized: 'Answer',
    category: 'Physics',
    difficulty: 3,
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-03T03:04:05.000Z',
    packet: { _id: 'packet-id', name: 'Round 1', number: 1 },
    set: { _id: 'set-id', name: '2026 NSB Regionals', year: 2026, standard: true }
  });
});

test('mapBonusRow maps Postgres arrays to the existing bonus response shape', () => {
  const row = {
    id: '7f0a7a22-0b8e-47fd-9b90-86d54be0929d',
    number: 2,
    leadin: 'Leadin',
    leadin_sanitized: 'leadin',
    parts: ['Part 1'],
    parts_sanitized: ['part 1'],
    answers: ['Answer 1'],
    answers_sanitized: ['answer 1'],
    values: [10],
    category: 'Chemistry',
    difficulty: 4,
    created_at: new Date('2026-01-02T03:04:05.000Z'),
    updated_at: new Date('2026-01-03T03:04:05.000Z'),
    packet_id: 'packet-id',
    packet_name: 'Round 1',
    packet_number: 1,
    set_id: 'set-id',
    set_name: '2026 NSB Regionals',
    set_year: 2026,
    set_standard: true
  };

  assert.equal(mapBonusRow(row)._id, row.id);
  assert.deepEqual(mapBonusRow(row).parts, ['Part 1']);
  assert.deepEqual(mapBonusRow(row).packet, { _id: 'packet-id', name: 'Round 1', number: 1 });
});
