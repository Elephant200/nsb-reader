#!/usr/bin/env node

/** Download and parse the DOE sample PDFs into a local JSON corpus. */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseNsbPdf } from './parse-nsb-pdf.js';
import { applyNsbQuestionCorrections } from './nsb-question-corrections.js';

const DEFAULT_MANIFEST = path.resolve('docs/nsb-source-manifest.json');
const DEFAULT_OUTPUT = path.resolve('data/nsb/sample-questions.json');
const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;

function parseArgs (args) {
  const options = { manifest: DEFAULT_MANIFEST, output: DEFAULT_OUTPUT, concurrency: 3 };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--manifest') options.manifest = path.resolve(args[++i]);
    else if (arg === '--output') options.output = path.resolve(args[++i]);
    else if (arg === '--concurrency') options.concurrency = Number(args[++i]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) {
    throw new Error('--concurrency must be an integer from 1 to 8');
  }
  return options;
}

async function downloadPdf (url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type') ?? '';
      if (!/pdf|octet-stream/i.test(type)) throw new Error(`unexpected content type: ${type || '(missing)'}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error(`PDF exceeds ${MAX_DOWNLOAD_BYTES} bytes`);
      if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('response does not contain a PDF signature');
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

function corpusSource (item) {
  return {
    setNumber: item.source_set_number,
    year: item.source_year,
    roundNumber: item.source_round_number,
    label: item.source_round_label,
    filename: item.source_filename,
    url: item.source_file_url,
    supplemental: item.supplemental
  };
}

async function processItem (item, index, total, tempDir) {
  const bytes = await downloadPdf(item.source_file_url);
  const pdfPath = path.join(tempDir, `${String(index).padStart(3, '0')}-${item.source_filename}`);
  await fs.writeFile(pdfPath, bytes);
  try {
    const parsedPacket = await parseNsbPdf(pdfPath);
    const packet = {
      ...parsedPacket,
      ...applyNsbQuestionCorrections(item.source_file_url, parsedPacket)
    };
    const diagnostics = packet.diagnostics;
    const errors = [...diagnostics.errors];
    if (!item.supplemental && !packet.tossups.length && !packet.bonuses.length) errors.push('parser returned no questions');
    if (item.supplemental && !packet.tossups.length && !packet.bonuses.length) {
      const emptyParserResult = 'No questions were parsed';
      const emptyResultIndex = errors.indexOf(emptyParserResult);
      if (emptyResultIndex !== -1) errors.splice(emptyResultIndex, 1);
    }
    if (!item.supplemental && packet.tossups.length !== packet.bonuses.length) {
      errors.push(`toss-up/bonus count mismatch: ${packet.tossups.length}/${packet.bonuses.length}`);
    }
    const tossupNumbers = new Set(packet.tossups.map(q => q.number));
    const bonusNumbers = new Set(packet.bonuses.map(q => q.number));
    if (!item.supplemental) {
      for (const number of tossupNumbers) if (!bonusNumbers.has(number)) errors.push(`no bonus paired with source question ${number}`);
      for (const number of bonusNumbers) if (!tossupNumbers.has(number)) errors.push(`no toss-up paired with source question ${number}`);
    }
    const itemsToCheck = [
      ...packet.tossups.map(question => ({ type: 'toss-up', question, requiredText: question.question, requiredAnswer: question.answer })),
      ...packet.bonuses.map(question => ({ type: 'bonus', question, requiredText: question.parts?.[0], requiredAnswer: question.answers?.[0] }))
    ];
    for (const [qIndex, item] of itemsToCheck.entries()) {
      const { type, question, requiredText, requiredAnswer } = item;
      if (question.number === undefined || question.number === null) errors.push(`${type} ${qIndex + 1} missing source number`);
      if (!requiredText) errors.push(`${type} ${qIndex + 1} missing question text`);
      if (!requiredAnswer) errors.push(`${type} ${qIndex + 1} missing answer`);
      if (!question.category) errors.push(`${type} ${qIndex + 1} missing category`);
    }
    return {
      source: corpusSource(item),
      tossups: packet.tossups,
      bonuses: packet.bonuses,
      status: errors.length ? 'needs-review' : (item.supplemental ? 'informational' : 'parsed'),
      diagnostics: { errors: [...new Set(errors)], warnings: diagnostics.warnings }
    };
  } finally {
    await fs.rm(pdfPath, { force: true });
  }
}

async function mapLimit (items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker () {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        results[index] = {
          source: corpusSource(items[index]),
          tossups: [],
          bonuses: [],
          status: 'needs-review',
          diagnostics: { errors: [error.message], warnings: [] }
        };
      }
      const done = results.filter(Boolean).length;
      if (done % 10 === 0 || done === items.length) console.error(`Processed ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function buildNsbCorpus ({ manifestPath = DEFAULT_MANIFEST, outputPath = DEFAULT_OUTPUT, concurrency = 3 } = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.items) || manifest.count !== manifest.items.length) throw new Error('Manifest is missing items or has an incorrect count');
  const urls = new Set(manifest.items.map(item => item.source_file_url));
  const ids = new Set(manifest.items.map(item => item.source_id));
  if (urls.size !== manifest.items.length || ids.size !== manifest.items.length) throw new Error('Manifest contains duplicate URLs or source IDs');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nsb-corpus-'));
  let packets;
  try {
    packets = await mapLimit(manifest.items, concurrency, (item, index) => processItem(item, index, manifest.items.length, tempDir));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  const failures = packets.filter(packet => packet.diagnostics.errors.length);
  const corpus = {
    schemaVersion: 1,
    sourcePageUrl: manifest.source_page_url,
    sourceCount: manifest.count,
    processedCount: packets.length,
    failedCount: failures.length,
    parsedCount: packets.filter(packet => packet.status === 'parsed').length,
    informationalCount: packets.filter(packet => packet.status === 'informational').length,
    reviewCount: failures.length,
    packets
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(corpus, null, 2)}\n`);
  return { corpus, outputPath };
}

async function main () {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node tools/import/bulk-import-all-samples.js [--manifest path] [--output path] [--concurrency 1..8]');
    console.log('Builds a local JSON corpus only. No database writes are performed.');
    return;
  }
  const { corpus, outputPath } = await buildNsbCorpus(options);
  console.log(`Wrote ${corpus.processedCount} source files to ${outputPath}; ${corpus.failedCount} need review.`);
  if (corpus.failedCount) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
