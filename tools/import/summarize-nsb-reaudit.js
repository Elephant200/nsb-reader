import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { normalizePacketJson } from './packet-json.js';

const directory = 'data/nsb/audit';
const corpus = JSON.parse(fs.readFileSync('data/nsb/sample-questions.json', 'utf8'));
const baselinePath = 'tmp/pdfs/nsb-audit/reaudit-baseline-2026-10-10.json';
const baselineText = fs.existsSync(baselinePath)
  ? fs.readFileSync(baselinePath, 'utf8')
  : execFileSync('git', ['show', '1f10d466:data/nsb/sample-questions.json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const baseline = JSON.parse(baselineText);
const categoryName = value => value.replace(/^\)\s*/, '').replace(/^MATH$/i, 'Math');
const expected = new Map();
const categories = new Map(['Math', 'Chemistry'].map(category => [category, { category, total: 0, reviewed: 0, corrected: 0, unresolved: 0, years: {} }]));
for (const [p, packet] of corpus.packets.entries()) {
  for (const k of ['tossups', 'bonuses']) {
    for (const [i, question] of packet[k].entries()) {
      const category = categoryName(question.category);
      if (!categories.has(category)) {
        if (JSON.stringify(question) !== JSON.stringify(baseline.packets[p][k][i])) throw new Error(`Other category changed: ${p}/${k}/${i}`);
        continue;
      }
      expected.set(`${p}/${k}/${i}`, { number: question.number, category, year: packet.source.year });
      categories.get(category).total++;
    }
  }
}
const seen = new Set();
const findings = [];
const sourceIssues = [];
for (const suffix of ['a', 'b', 'c', 'd']) {
  const path = `${directory}/reaudit-2026-10-10-${suffix}.json`;
  if (!fs.existsSync(path)) continue;
  const report = JSON.parse(fs.readFileSync(path, 'utf8'));
  for (const entry of report.entries) {
    const key = `${entry.p}/${entry.k}/${entry.i}`;
    const original = expected.get(key);
    if (!original || original.number !== entry.number || seen.has(key)) throw new Error(`Unexpected or duplicate identity: ${key}`);
    const assignedPartition = suffix === 'd' ? 2 : 'abc'.indexOf(suffix);
    if (entry.category !== original.category || entry.year !== original.year || entry.p % 3 !== assignedPartition || (suffix === 'd' && entry.p < 212)) throw new Error(`Incorrect assigned scope: ${key}`);
    if (!['verified', 'corrected', 'unresolved'].includes(entry.status)) throw new Error(`Invalid status: ${key}`);
    if (!entry.evidence || !entry.sourcePages?.length || !entry.imagePaths?.length) throw new Error(`Missing visual evidence: ${key}`);
    if (entry.imagePaths.some(path => !fs.existsSync(path))) throw new Error(`Missing source render: ${key}`);
    if (entry.status === 'corrected' && !Object.keys(entry.changes ?? {}).length) throw new Error(`Missing correction: ${key}`);
    seen.add(key);
    const row = categories.get(original.category);
    const year = row.years[original.year] ?? { total: 0, reviewed: 0, corrected: 0, unresolved: 0 };
    row.years[original.year] = year;
    row.reviewed++;
    year.reviewed++;
    for (const status of ['corrected', 'unresolved']) {
      row[status] += Number(entry.status === status);
      year[status] += Number(entry.status === status);
    }
    if (entry.status === 'unresolved' || entry.sourceIssue) sourceIssues.push({ p: entry.p, k: entry.k, i: entry.i, number: entry.number, category: original.category, year: original.year, kind: entry.sourceIssueKind ?? 'source-conflict', resolved: entry.sourceIssueResolved === true, source: baseline.packets[entry.p].source, sourcePages: entry.sourcePages, evidence: entry.sourceIssue ?? entry.evidence, report: path });
    if (entry.status !== 'verified' || entry.sourceIssue) {
      const sourceQuestion = baseline.packets[entry.p][entry.k][entry.i];
      const changes = { ...entry.changes };
      const merged = { ...sourceQuestion, ...changes };
      const richFields = ['question', 'answer', 'parts', 'answers', 'leadin'].filter(field => Object.hasOwn(changes, field));
      for (const field of richFields) delete merged[`${field}_sanitized`];
      if (richFields.length) {
        const packet = baseline.packets[entry.p];
        const normalized = normalizePacketJson({ data: { tossups: entry.k === 'tossups' ? [merged] : [], bonuses: entry.k === 'bonuses' ? [merged] : [] }, difficulty: 0, packetName: 'Audit', packetNumber: packet.source.roundNumber, setName: `${packet.source.year} NSB Sample Set ${packet.source.setNumber}`, year: packet.source.year });
        for (const field of richFields) changes[`${field}_sanitized`] = normalized[entry.k][0][`${field}_sanitized`];
      }
      const before = Object.fromEntries(Object.keys(changes).map(field => [field, sourceQuestion[field]]));
      findings.push({ ...entry, changes, before, category: original.category, year: original.year, source: baseline.packets[entry.p].source, report: path });
    }
  }
}
for (const original of expected.values()) {
  const row = categories.get(original.category);
  const year = row.years[original.year] ?? { total: 0, reviewed: 0, corrected: 0, unresolved: 0 };
  row.years[original.year] = year;
  year.total++;
}
const rows = [...categories.values()];
const summary = {
  updatedAt: new Date().toISOString(),
  scope: 'Independent repeat source-PDF audit of every Math and Chemistry question. Other categories are outside this pass.',
  baselineCommit: '1f10d466',
  baselineSha256: createHash('sha256').update(baselineText).digest('hex'),
  otherCategoriesUnchanged: true,
  total: expected.size,
  reviewed: seen.size,
  pending: expected.size - seen.size,
  corrected: rows.reduce((sum, row) => sum + row.corrected, 0),
  unresolved: rows.reduce((sum, row) => sum + row.unresolved, 0),
  categories: rows,
  sourceIssues,
  findings
};
fs.writeFileSync(`${directory}/reaudit-2026-10-10-summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ total: summary.total, reviewed: summary.reviewed, pending: summary.pending, corrected: summary.corrected, unresolved: summary.unresolved, categories: rows.map(({ years, ...row }) => row) }, null, 2));
