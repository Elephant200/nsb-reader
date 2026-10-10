import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://localhost:8787';
async function get (path, params = {}) {
  const response = await fetch(new URL(path + '?' + new URLSearchParams(params), base));
  assert.equal(response.status, 200, path);
  return response.json();
}
const sets = await get('/api/set-list', { expand: true, includeCounts: true });
assert.equal(sets.setList.length, 17);
assert.equal(sets.setList.reduce((n, set) => n + set.tossupsCount, 0), 6012);
const set = sets.setList.find(set => set.setName === '2009 NSB Sample Set 1');
const packets = await get('/api/packet-list', { set_id: set._id, expand: true });
assert.ok(packets.packetList.length > 0);
const packet = await get('/api/packet', { setName: set.setName, packetNumber: 3 });
const paired = await get('/api/paired-bonus', { packetId: packet.packet._id, number: 18 });
assert.equal(paired.bonus._id, packet.bonuses.find(q => q.number === 18)._id);
assert.match(paired.bonus.parts[0], /nsb-fraction/);
for (const kind of ['tossup', 'bonus']) {
  const key = kind === 'bonus' ? 'bonuses' : 'tossups';
  const random = (await get(`/api/random-${kind}`, { categories: 'Math', number: 10 }))[key];
  assert.equal(random.length, 10);
  assert.equal(new Set(random.map(q => q._id)).size, 10);
  assert.ok(random.every(q => q.category === 'Math'));
  const lookup = await get(`/api/${kind}`, { _id: random[0]._id });
  assert.deepEqual(lookup[kind], random[0]);
}
const search = await get('/api/query', { queryString: 'polynomial', categories: 'Math' });
assert.ok(search.tossups.count > 0);
assert.ok(search.bonuses.count > 0);
const regex = await get('/api/query', { queryString: 'poly(nomial)?', regex: true, categories: 'Math' });
assert.ok(regex.tossups.count >= search.tossups.count);
const exact = await get('/api/query', { queryString: 'PHENOTYPE', searchType: 'exactAnswer' });
assert.ok(exact.tossups.count > 0);
const frequency = await get('/api/frequency-list', { category: 'Biology' });
assert.ok(frequency.frequencyList.length > 0);
for (const path of ['/play/tossups/', '/play/bonuses/', '/play/in-person/', '/play/mp/DeploymentCheck']) {
  const response = await fetch(new URL(path, base), { redirect: 'manual' });
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.ok(!html.includes('<!--#include'));
  assert.ok(html.includes('navbar'));
}
console.log('Cloudflare API, corpus, math formatting, search, and page routing checks passed.');
