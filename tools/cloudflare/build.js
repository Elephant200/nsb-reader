import fs from 'node:fs/promises';
import path from 'node:path';
import { v5 as uuid } from 'uuid';
import { prepareImportPlan } from '../import/import-corpus.js';
import { normalizePacketJson } from '../import/packet-json.js';
import { replaceSSI } from '../../routes/ssi-middleware.js';

const output = '.cloudflare';
const namespace = 'e3849a4e-822b-4b1a-a9c1-74f34519d970';
const id = name => uuid(name, namespace);
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const sql = (table, values) => `INSERT OR REPLACE INTO ${table} VALUES (${values.map(quote).join(',')});`;

await fs.mkdir(output, { recursive: true });
await fs.rm(`${output}/assets`, { recursive: true, force: true });
await fs.cp('client', `${output}/assets`, { recursive: true, filter: source => !source.endsWith('.jsx') && !source.endsWith('.map') });
await fs.cp('shared', `${output}/assets/shared`, { recursive: true });
await fs.copyFile('types.js', `${output}/assets/types.js`);
await fs.cp('node_modules/bootstrap-icons/font', `${output}/assets/bootstrap-icons/font`, { recursive: true });
await fs.cp('node_modules/bootstrap/dist', `${output}/assets/bootstrap/dist`, { recursive: true });

async function expandHtml (directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await expandHtml(file);
    else if (file.endsWith('.html')) await fs.writeFile(file, replaceSSI(await fs.readFile(file, 'utf8')));
  }
}
await expandHtml(`${output}/assets`);
await fs.writeFile(`${output}/assets/_headers`, '/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: SAMEORIGIN\n  Referrer-Policy: strict-origin-when-cross-origin\n');

const corpus = JSON.parse(await fs.readFile('data/nsb/sample-questions.json', 'utf8'));
const { plan } = prepareImportPlan(corpus);
const sets = new Map();
const statements = [];
const buckets = {};
const searchIndex = [];
const ordinals = { tossup: 0, bonus: 0 };
const timestamp = '2026-10-01T00:00:00.000Z';
for (const params of plan) {
  const normalized = normalizePacketJson(params);
  const set = { _id: id(params.setName), ...normalized.set };
  sets.set(set._id, set);
  const packet = { _id: id(`${params.setName}/${params.packetNumber}`), name: params.packetName, number: params.packetNumber };
  statements.push(sql('packets', [packet._id, set._id, packet.number, JSON.stringify({ ...packet, set })]));
  for (const kind of ['tossup', 'bonus']) {
    for (const item of normalized[kind === 'bonus' ? 'bonuses' : 'tossups']) {
      const ordinal = ++ordinals[kind];
      const question = { ...item, _id: id(`${packet._id}/${kind}/${item.number}`), packet, set, createdAt: timestamp, updatedAt: timestamp };
      const text = kind === 'tossup' ? item.question_sanitized : [item.leadin_sanitized, ...item.parts_sanitized].join(' ');
      const answer = kind === 'tossup' ? item.answer_sanitized : item.answers_sanitized.join(' ');
      statements.push(sql('questions', [question._id, kind, ordinal, packet._id, item.number, item.category, set.year, set.name, text, answer, JSON.stringify(question)]));
      searchIndex.push({ id: question._id, kind, category: item.category, year: set.year, setName: set.name, packetNumber: packet.number, number: item.number, question: text, answer });
      const key = JSON.stringify([kind, item.category, set.year]);
      (buckets[key] ??= []).push(ordinal);
    }
  }
}
const setStatements = [...sets.values()].map(set => sql('sets', [set._id, set.name, set.year, JSON.stringify(set)]));
await fs.writeFile(`${output}/seed.sql`, [...setStatements, ...statements].join('\n') + '\n');
await fs.writeFile(`${output}/question-buckets.js`, 'export default ' + JSON.stringify(Object.entries(buckets).map(([key, ordinals]) => ({ key: JSON.parse(key), ordinals }))) + ';\n');
await fs.writeFile(`${output}/assets/question-search.json`, JSON.stringify(searchIndex));
console.log(`Built Cloudflare assets and ${ordinals.tossup} tossups / ${ordinals.bonus} bonuses in ${plan.length} packets.`);
