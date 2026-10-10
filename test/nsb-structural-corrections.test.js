import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import applyNsbStructuralCorrections from '../tools/import/apply-nsb-structural-corrections.js';
import { prepareImportPlan } from '../tools/import/import-corpus.js';

const corpus = JSON.parse(fs.readFileSync(new URL('../data/nsb/sample-questions.json', import.meta.url), 'utf8'));

test('source header repairs recover both playable pairs without changing audit identities', () => {
  for (const [index, number] of [[163, 18], [180, 5]]) {
    const packet = corpus.packets[index];
    const before = structuredClone(packet);
    const recovered = applyNsbStructuralCorrections(packet.source.url, packet);
    assert.equal(recovered.tossups.filter(item => item.number === number).length, 1);
    assert.equal(recovered.bonuses.filter(item => item.number === number).length, 1);
    assert.deepEqual(packet, before);
    assert.deepEqual(applyNsbStructuralCorrections(packet.source.url, recovered), recovered);
    const { plan, skipped } = prepareImportPlan({ packets: [packet] });
    assert.equal(skipped.pairs, 0);
    assert.equal(plan[0].data.tossups.length, 23);
    assert.equal(plan[0].data.bonuses.length, 23);
  }
});

test('source header repairs refuse conflicting or ambiguous identities', () => {
  const packet = structuredClone(corpus.packets[163]);
  packet.bonuses.push(structuredClone(packet.bonuses.find(item => item.number === 18)));
  assert.throws(() => applyNsbStructuralCorrections(packet.source.url, packet), /Ambiguous/);
  const other = structuredClone(corpus.packets[180]);
  other.tossups.push({ number: 5, question: 'Unrelated question' });
  assert.throws(() => applyNsbStructuralCorrections(other.source.url, other), /conflicts/);
});
