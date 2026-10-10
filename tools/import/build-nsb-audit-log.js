import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { renderReadingText } from '../../shared/render-reading-text.js';
import applyNsbStructuralCorrections, { structuralCorrections } from './apply-nsb-structural-corrections.js';

const directory = new URL('../../data/nsb/audit/', import.meta.url);
const corpus = JSON.parse(await fs.readFile(new URL('../sample-questions.json', directory), 'utf8'));
const records = [];
const status = JSON.parse(await fs.readFile(new URL('status.json', directory), 'utf8'));
const audit = { flagged: status.flaggedQuestionCount, reviewed: 0, unresolved: 0 };
const fieldLabels = { question: 'Question', answer: 'Answer', leadin: 'Lead-in', parts: 'Bonus question', answers: 'Answer', options: 'Choices', notes: 'Solution notes', category: 'Category', type: 'Question type' };
const text = value => Array.isArray(value) ? value.join('\n') : String(value ?? '');
const files = (await fs.readdir(directory)).filter(name => /^(pdf|extra|second)-\d{3}\.json$/.test(name)).sort();
const reviews = await Promise.all(files.map(async file => ({ file, review: JSON.parse(await fs.readFile(new URL(file, directory), 'utf8')) })));
const secondEntries = new Map(reviews.filter(({ file }) => file.startsWith('second-')).flatMap(({ review }) => review.entries.map(entry => [`${review.packetIndex}-${entry.kind}-${entry.itemIndex}`, entry])));
if (secondEntries.size) audit.secondPass = { total: corpus.packets.reduce((total, packet) => total + packet.tossups.length + packet.bonuses.length, 0) + structuralCorrections.filter(rule => rule.operation === 'add-tossup').length, reviewed: 0, unresolved: 0 };

for (const { file, review } of reviews) {
  const pass = file.startsWith('second-') ? 2 : 1;
  const packet = corpus.packets[review.packetIndex];
  if (packet.source.url !== review.sourceUrl) throw new Error(`${file}: source mismatch`);
  const progress = pass === 2 ? audit.secondPass : audit;
  if (!file.startsWith('extra-')) {
    progress.reviewed += review.entries.filter(entry => ['verified', 'corrected', 'unresolved'].includes(entry.status)).length;
    progress.unresolved += review.entries.filter(entry => entry.status === 'unresolved').length;
  }
  if (pass === 2) {
    for (const recovery of review.recoveryReviews ?? []) {
      if (recovery.operation !== 'add-tossup') continue;
      if (['verified', 'unresolved'].includes(recovery.status)) progress.reviewed++;
      if (recovery.status === 'unresolved') progress.unresolved++;
    }
  }
  for (const entry of review.entries.filter(entry => entry.status === 'corrected')) {
    const current = packet[entry.kind][entry.itemIndex];
    if (current.number !== entry.number) throw new Error(`${file}: question identity mismatch`);
    const fields = Object.entries(entry.changes).filter(([field, after]) => JSON.stringify(entry.before?.[field]) !== JSON.stringify(after)).map(([field, after]) => ({
      key: field,
      label: fieldLabels[field.replace(/_sanitized$/, '')] ?? field,
      reading: field.endsWith('_sanitized'),
      added: !Object.hasOwn(entry.before ?? {}, field),
      before: text(entry.before?.[field]),
      after: text(after),
      beforeHtml: renderReadingText(text(entry.before?.[field]), { formatChoices: false }),
      afterHtml: renderReadingText(text(after), { formatChoices: false })
    }));
    if (!fields.length) continue;
    const identity = `${review.packetIndex}-${entry.kind}-${entry.itemIndex}`;
    const second = pass === 1 ? secondEntries.get(identity) : undefined;
    const matches = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    const currentMatches = Object.entries(entry.changes).every(([field, value]) => matches(current[field], value));
    const applied = currentMatches || Object.entries(entry.changes).every(([field, value]) => matches(current[field], value) || (second?.status === 'corrected' && Object.hasOwn(second.changes, field) && matches(second.before?.[field], value) && matches(current[field], second.changes[field])));
    records.push({
      id: pass === 1 ? identity : `second-${identity}`,
      pass,
      packetIndex: review.packetIndex,
      set: packet.source.setNumber,
      year: packet.source.year,
      round: packet.source.roundNumber,
      kind: entry.kind === 'tossups' ? 'Toss-up' : 'Bonus',
      number: entry.number,
      category: current.category,
      applied,
      superseded: applied && !currentMatches,
      sourceUrl: review.sourceUrl,
      sourcePages: entry.sourcePages,
      evidence: entry.evidence,
      fields
    });
  }
}

for (const rule of structuralCorrections) {
  const packet = corpus.packets[rule.packetIndex];
  if (packet.source.url !== rule.sourceUrl) throw new Error('Structural correction source mismatch');
  const repaired = applyNsbStructuralCorrections(rule.sourceUrl, packet);
  const question = repaired.tossups.find(item => item.number === rule.number);
  const values = rule.operation === 'add-tossup'
    ? [['question', '', question.question], ['answer', '', question.answer]]
    : [['type', 'Extracted as a second bonus with the same number', 'Toss-up, followed by its existing bonus']];
  records.push({
    id: `structure-${rule.packetIndex}-${rule.number}`,
    packetIndex: rule.packetIndex,
    pass: 'Source recovery',
    set: packet.source.setNumber,
    year: packet.source.year,
    round: packet.source.roundNumber,
    kind: 'Toss-up',
    number: rule.number,
    category: question.category,
    applied: true,
    statusLabel: 'Applied to local import plan',
    sourceUrl: rule.sourceUrl,
    sourcePages: rule.sourcePages,
    evidence: rule.evidence,
    fields: values.map(([key, before, after]) => ({ key, label: fieldLabels[key], reading: false, added: !before, before, after, beforeHtml: renderReadingText(before, { formatChoices: false }), afterHtml: renderReadingText(after, { formatChoices: false }) }))
  });
}

const version = createHash('sha256').update(JSON.stringify({ audit, records })).digest('hex');
const destination = new URL('corrections.json', directory);
let existing;
try { existing = JSON.parse(await fs.readFile(destination, 'utf8')); } catch {}
if (existing?.version !== version) {
  const temporary = new URL(`.corrections-${process.pid}.tmp`, directory);
  await fs.writeFile(temporary, JSON.stringify({ version, updatedAt: new Date().toISOString(), audit, records }, null, 2) + '\n');
  await fs.rename(temporary, destination);
}
console.log(`Running log: ${records.length} corrections; ${records.filter(record => record.applied).length} applied locally.`);
