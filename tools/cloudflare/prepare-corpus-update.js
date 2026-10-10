import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const content = data => {
  const { createdAt, updatedAt, ...fields } = JSON.parse(data);
  return fields;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Plans a corpus update while retaining existing identities, ordinals and reports.
 * @param {DatabaseSync} production A read-only snapshot loaded into memory.
 * @param {DatabaseSync} desired The current generated corpus loaded into memory.
 * @param {string} timestamp The release timestamp.
 * @returns {{sql: string, changed: number, added: number, buckets: Object[], search: Object[]}}
 */
export function prepareCorpusUpdate (production, desired, timestamp) {
  const statements = [];
  for (const table of ['sets', 'packets']) {
    const existing = new Map(production.prepare(`SELECT * FROM ${table}`).all().map(row => [row.id, row]));
    for (const row of desired.prepare(`SELECT * FROM ${table}`).all()) {
      if (!same(existing.get(row.id), row)) {
        const columns = Object.keys(row);
        statements.push(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(key => quote(row[key])).join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns.filter(key => key !== 'id').map(key => `${key}=excluded.${key}`).join(',')};`);
      }
    }
  }
  const current = production.prepare('SELECT * FROM questions ORDER BY kind, ordinal').all();
  const wanted = desired.prepare('SELECT * FROM questions ORDER BY kind, ordinal').all();
  const desiredIds = new Set(wanted.map(row => row.id));
  for (const row of current) {
    if (!desiredIds.has(row.id)) throw new Error(`Corpus would remove existing question ${row.id}; reconcile source identity first.`);
  }
  const byId = new Map(current.map(row => [row.id, row]));
  const nextOrdinal = { tossup: 0, bonus: 0 };
  for (const row of current) nextOrdinal[row.kind] = Math.max(nextOrdinal[row.kind], row.ordinal);
  let changed = 0;
  let added = 0;
  for (const row of wanted) {
    const previous = byId.get(row.id);
    if (previous && (previous.kind !== row.kind || previous.packet_id !== row.packet_id || previous.number !== row.number)) {
      throw new Error(`Question identity changed for ${row.id}.`);
    }
    if (previous && same(content(previous.data), content(row.data)) && ['category', 'year', 'set_name', 'question_text', 'answer_text'].every(key => previous[key] === row[key])) continue;
    const data = JSON.parse(row.data);
    data.createdAt = previous ? JSON.parse(previous.data).createdAt : timestamp;
    data.updatedAt = timestamp;
    const updated = { ...row, ordinal: previous?.ordinal ?? ++nextOrdinal[row.kind], data: JSON.stringify(data) };
    if (previous) {
      changed++;
      const columns = ['category', 'year', 'set_name', 'question_text', 'answer_text', 'data'];
      statements.push(`UPDATE questions SET ${columns.map(key => `${key}=${quote(updated[key])}`).join(',')} WHERE id=${quote(row.id)};`);
    } else {
      added++;
      const columns = Object.keys(updated);
      statements.push(`INSERT INTO questions (${columns.join(',')}) VALUES (${columns.map(key => quote(updated[key])).join(',')});`);
    }
    byId.set(row.id, updated);
  }
  const final = [...byId.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.ordinal - b.ordinal);
  const buckets = new Map();
  const search = [];
  for (const row of final) {
    const key = JSON.stringify([row.kind, row.category, row.year]);
    const ordinals = buckets.get(key) ?? [];
    ordinals.push(row.ordinal);
    buckets.set(key, ordinals);
    const data = JSON.parse(row.data);
    search.push({ id: row.id, kind: row.kind, category: row.category, year: row.year, setName: row.set_name, packetNumber: data.packet.number, number: row.number, question: row.question_text, answer: row.answer_text });
  }
  return { sql: statements.join('\n') + '\n', changed, added, buckets: [...buckets].map(([key, ordinals]) => ({ key: JSON.parse(key), ordinals })), search };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const snapshot = process.argv[2];
  if (!snapshot) throw new Error('Usage: node tools/cloudflare/prepare-corpus-update.js <production-export.sql> [output.sql]');
  const production = new DatabaseSync(':memory:');
  production.exec(fs.readFileSync(snapshot, 'utf8'));
  const desired = new DatabaseSync(':memory:');
  desired.exec(fs.readFileSync('cloudflare/migrations/0001_questions.sql', 'utf8'));
  desired.exec(fs.readFileSync('.cloudflare/seed.sql', 'utf8'));
  const reportsBefore = production.prepare('SELECT * FROM question_reports ORDER BY id').all();
  const ordinalsBefore = production.prepare('SELECT id, kind, ordinal FROM questions ORDER BY id').all();
  const plan = prepareCorpusUpdate(production, desired, new Date().toISOString());
  production.exec(plan.sql);
  if (!same(reportsBefore, production.prepare('SELECT * FROM question_reports ORDER BY id').all())) throw new Error('Reports changed.');
  for (const before of ordinalsBefore) {
    if (!same(before, production.prepare('SELECT id, kind, ordinal FROM questions WHERE id=?').get(before.id))) throw new Error('Existing ordinal changed.');
  }
  if (production.prepare('SELECT COUNT(*) AS n FROM questions').get().n !== plan.search.length) throw new Error('Index count mismatch.');
  if (production.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Invalid foreign key.');
  fs.writeFileSync(process.argv[3] ?? '.cloudflare/corpus-update.sql', plan.sql);
  fs.writeFileSync('.cloudflare/question-buckets.js', 'export default ' + JSON.stringify(plan.buckets) + ';\n');
  fs.writeFileSync('.cloudflare/assets/question-search.json', JSON.stringify(plan.search));
  fs.writeFileSync('.cloudflare/corpus-update-summary.json', JSON.stringify({ changed: plan.changed, added: plan.added, questions: plan.search.length, reportsPreserved: reportsBefore.length, existingOrdinalsPreserved: ordinalsBefore.length }, null, 2));
  console.log(`${plan.changed} updates, ${plan.added} additions; ${plan.search.length} questions. All existing identities, ordinals and reports preserved.`);
  production.close();
  desired.close();
}
