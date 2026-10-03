import 'dotenv/config';

import upsertPacketJson from './upsert-packet.js';
import { parseNsbPdf } from './parse-nsb-pdf.js';

import fs from 'fs';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .command('$0 <file>', 'Import a parsed NSB packet JSON file into Supabase Postgres')
  .positional('file', {
    describe: 'Path to parsed packet JSON',
    type: 'string'
  })
  .option('setName', {
    demandOption: true,
    describe: 'Set name, e.g. "2026 NSB Regionals"',
    type: 'string'
  })
  .option('packetName', {
    demandOption: true,
    describe: 'Packet name, e.g. "Round 1"',
    type: 'string'
  })
  .option('packetNumber', {
    demandOption: true,
    describe: 'One-indexed packet number',
    type: 'number'
  })
  .option('difficulty', {
    default: 0,
    describe: 'Difficulty value to attach to imported questions',
    type: 'number'
  })
  .option('standard', {
    default: true,
    describe: 'Whether this set should appear in standard-only filters',
    type: 'boolean'
  })
  .help()
  .parse();

const sourceFile = argv.file;
const data = sourceFile.endsWith('.pdf')
  ? await parseNsbPdf(sourceFile)
  : JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const result = await upsertPacketJson({
  data,
  difficulty: argv.difficulty,
  packetName: argv.packetName,
  packetNumber: argv.packetNumber,
  setName: argv.setName,
  sourceFile,
  standard: argv.standard
});

console.log(`Imported ${result.tossupCount} tossups and ${result.bonusCount} bonuses into packet ${result.packetId}.`);
