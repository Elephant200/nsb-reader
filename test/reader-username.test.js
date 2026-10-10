import test from 'node:test';
import assert from 'node:assert/strict';
import readerUsername from '../server/multiplayer/reader-username.js';

const players = { a: { id: 'a', username: 'Alex' }, b: { id: 'b', username: 'Taylor' } };

test('reader usernames reject invalid and duplicate input while allowing own-name edits', () => {
  assert.equal(readerUsername('  Alex  ', players, 'a'), 'Alex');
  assert.equal(readerUsername('TAYLOR', players, 'a'), null);
  assert.equal(readerUsername('A New Name', players, 'a'), 'A New Name');
  for (const invalid of ['', '  ', 'x'.repeat(33), '<img>', 'a\nb', 5, null]) assert.equal(readerUsername(invalid, players, 'a'), null);
});
