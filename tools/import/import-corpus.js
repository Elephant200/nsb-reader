#!/usr/bin/env node

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import upsertPacketJson from './upsert-packet.js';
import { normalizePacketJson } from './packet-json.js';
import { applyNsbQuestionCorrections } from './nsb-question-corrections.js';
import { close, pool } from '../../database/postgres.js';

const DEFAULT_CORPUS = path.resolve('data/nsb/sample-questions.json');

function questionError (item, kind) {
  if (!item || !Number.isInteger(item.number) || item.number < 1) return `${kind} has invalid source number`;
  if (Array.isArray(item.validationErrors) && item.validationErrors.length) return item.validationErrors.join('; ');
  if (!item.category) return `${kind} is missing category`;
  if (kind === 'toss-up') {
    if (!item.question?.trim()) return 'toss-up is missing question text';
    if (!item.answer?.trim()) return 'toss-up is missing answer';
  } else {
    if (!Array.isArray(item.parts) || !item.parts.length || item.parts.some(part => !part?.trim())) return 'bonus is missing question parts';
    if (!Array.isArray(item.answers) || item.answers.length !== item.parts.length || item.answers.some(answer => !answer?.trim())) return 'bonus is missing answers';
  }
  if (item.type === 'Multiple Choice') {
    const labels = (item.options ?? []).map(option => option.match(/^([WXYZ])\)/i)?.[1]?.toUpperCase() ?? '');
    if (labels.join('') !== 'WXYZ') return `multiple-choice options are incomplete or malformed (${labels.join(',') || 'none'})`;
  }
  return null;
}

function isDuplicateNumber (items) {
  const counts = new Map();
  for (const item of items) counts.set(item.number, (counts.get(item.number) ?? 0) + 1);
  return number => counts.get(number) !== 1;
}

export function prepareImportPlan (corpus, { difficulty = 0, standard = true } = {}) {
  if (!corpus || !Array.isArray(corpus.packets)) throw new Error('Corpus must contain a packets array');
  const plan = [];
  const skipped = { supplemental: 0, tossups: 0, bonuses: 0, pairs: 0 };

  for (const packet of corpus.packets) {
    const source = packet.source;
    if (!source || !Number.isInteger(source.setNumber)) throw new Error('Corpus packet is missing set metadata');
    if (source.supplemental) {
      skipped.supplemental++;
      continue;
    }
    const correctedQuestions = applyNsbQuestionCorrections(source.url, {
      tossups: Array.isArray(packet.tossups) ? packet.tossups : [],
      bonuses: Array.isArray(packet.bonuses) ? packet.bonuses : []
    });
    const tossups = correctedQuestions.tossups;
    const bonuses = correctedQuestions.bonuses;
    const duplicateTossup = isDuplicateNumber(tossups);
    const duplicateBonus = isDuplicateNumber(bonuses);
    const bonusByNumber = new Map();
    for (const bonus of bonuses) {
      const group = bonusByNumber.get(bonus.number) ?? [];
      group.push(bonus);
      bonusByNumber.set(bonus.number, group);
    }
    const tossupByNumber = new Map();
    for (const tossup of tossups) {
      const group = tossupByNumber.get(tossup.number) ?? [];
      group.push(tossup);
      tossupByNumber.set(tossup.number, group);
    }

    const keptTossups = [];
    const keptBonuses = [];
    const handled = new Set();
    const allNumbers = new Set([...tossupByNumber.keys(), ...bonusByNumber.keys()]);
    for (const number of allNumbers) {
      const tsGroup = tossupByNumber.get(number) ?? [];
      const bonusGroup = bonusByNumber.get(number) ?? [];
      if (tsGroup.length !== 1 || bonusGroup.length !== 1 || duplicateTossup(number) || duplicateBonus(number)) {
        skipped.tossups += tsGroup.length;
        skipped.bonuses += bonusGroup.length;
        skipped.pairs++;
        handled.add(number);
        continue;
      }
      const tossup = tsGroup[0];
      const bonus = bonusGroup[0];
      const tossupProblem = questionError(tossup, 'toss-up');
      const bonusProblem = questionError(bonus, 'bonus');
      if (tossupProblem || bonusProblem) {
        skipped.tossups++;
        skipped.bonuses++;
        skipped.pairs++;
        handled.add(number);
        continue;
      }
      keptTossups.push(tossup);
      keptBonuses.push(bonus);
      handled.add(number);
    }
    for (const [number, group] of tossupByNumber) if (!handled.has(number)) skipped.tossups += group.length;
    for (const [number, group] of bonusByNumber) if (!handled.has(number)) skipped.bonuses += group.length;
    if (!keptTossups.length && !keptBonuses.length) continue;
    if (!Number.isInteger(source.year)) throw new Error(`Set ${source.setNumber} has no source year`);
    const setName = `${source.year} NSB Sample Set ${source.setNumber}`;
    const packetName = `Round ${source.roundNumber}`;
    const params = {
      data: { tossups: keptTossups, bonuses: keptBonuses },
      difficulty,
      packetName,
      packetNumber: source.roundNumber,
      setName,
      sourceFile: source.filename,
      standard,
      year: source.year
    };
    normalizePacketJson(params);
    plan.push(params);
  }
  return { plan, skipped };
}

function parseArgs (args) {
  const options = { corpus: DEFAULT_CORPUS, confirm: false, difficulty: 0, standard: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--corpus') options.corpus = path.resolve(args[++i]);
    else if (args[i] === '--confirm-import') options.confirm = true;
    else if (args[i] === '--difficulty') options.difficulty = Number(args[++i]);
    else if (args[i] === '--standard=false') options.standard = false;
    else if (args[i] === '--help' || args[i] === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return options;
}

async function main () {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node tools/import/import-corpus.js --confirm-import [--corpus file.json] [--difficulty 0] [--standard=false]');
    return;
  }
  const corpus = JSON.parse(await fs.readFile(options.corpus, 'utf8'));
  const { plan, skipped } = prepareImportPlan(corpus, options);
  const tossupCount = plan.reduce((count, packet) => count + packet.data.tossups.length, 0);
  const bonusCount = plan.reduce((count, packet) => count + packet.data.bonuses.length, 0);
  console.log(`Ready: ${plan.length} packets, ${tossupCount} toss-ups, ${bonusCount} bonuses.`);
  console.log(`Skipped: ${skipped.pairs} incomplete/ambiguous pairs, ${skipped.tossups} toss-ups, ${skipped.bonuses} bonuses, ${skipped.supplemental} informational supplements.`);
  if (!options.confirm) throw new Error('Pass --confirm-import to write these validated packets to Postgres');
  if (!pool) throw new Error('Missing DATABASE_URL, SUPABASE_DB_URL, or POSTGRES_URL');
  try {
    for (const params of plan) {
      await upsertPacketJson(params);
      console.log(`Imported ${params.packetName} into ${params.setName}`);
    }
  } finally {
    await close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
