import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { prepareCorpusUpdate } from '../tools/cloudflare/prepare-corpus-update.js';

function database (questions) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync('cloudflare/migrations/0001_questions.sql', 'utf8'));
  db.prepare('INSERT INTO sets VALUES (?, ?, ?, ?)').run('set', 'Set', 2022, '{}');
  db.prepare('INSERT INTO packets VALUES (?, ?, ?, ?)').run('packet', 'set', 1, '{}');
  for (const [id, ordinal, question] of questions) {
    const data = { _id: id, question, answer: '8', packet: { number: 1 }, createdAt: 'original', updatedAt: 'original' };
    db.prepare('INSERT INTO questions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, 'tossup', ordinal, 'packet', id === 'old' ? 1 : 2, 'Math', 2022, 'Set', question, '8', JSON.stringify(data));
  }
  return db;
}

test('corpus release retains references and ordinals while updating text and appending recovered questions', () => {
  const production = database([['old', 7, 'x2']]);
  const desired = database([['new', 1, 'y²'], ['old', 2, 'x²']]);
  production.prepare('INSERT INTO question_reports (question_id, reason, description) VALUES (?, ?, ?)').run('old', 'Formatting', 'Missing power');
  const plan = prepareCorpusUpdate(production, desired, 'release');
  assert.equal(plan.changed, 1);
  assert.equal(plan.added, 1);
  production.exec(plan.sql);
  assert.equal(production.prepare('SELECT ordinal FROM questions WHERE id=?').get('old').ordinal, 7);
  assert.equal(production.prepare('SELECT ordinal FROM questions WHERE id=?').get('new').ordinal, 8);
  assert.equal(production.prepare('SELECT question_id FROM question_reports').get().question_id, 'old');
  const updated = JSON.parse(production.prepare('SELECT data FROM questions WHERE id=?').get('old').data);
  assert.equal(updated.createdAt, 'original');
  assert.equal(updated.updatedAt, 'release');
  assert.equal(updated.question, 'x²');
  assert.deepEqual(plan.buckets[0].ordinals, [7, 8]);
  assert.equal(prepareCorpusUpdate(production, desired, 'later').changed, 0);
  production.close();
  desired.close();
});

test('corpus release refuses to silently remove an existing source identity', () => {
  const production = database([['old', 1, 'x²']]);
  const desired = database([['new', 1, 'y²']]);
  assert.throws(() => prepareCorpusUpdate(production, desired, 'release'), /remove existing question/);
  production.close();
  desired.close();
});
