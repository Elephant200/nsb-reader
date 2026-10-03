#!/usr/bin/env node

/**
 * Extract an offline, source-aware manifest from the DOE NSB sample page HTML.
 * This command only reads HTML and writes JSON; it never downloads PDFs or
 * connects to the application database.
 *
 * Usage:
 *   node tools/import/nsb-source-manifest.js page.html [manifest.json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_BASE = 'https://science.osti.gov';
const SOURCE_PAGE = `${SOURCE_BASE}/wdts/nsb/Regional-Competitions/Resources/HS-Sample-Questions`;
const SOURCE_ROOT = `${SOURCE_BASE}/-/media/wdts/nsb/pdf/HS-Sample-Questions/`;
const YEARS = new Map([
  [1, 2009], [2, 2012], [3, 2007], [4, 2011], [5, 2011], [6, 2012],
  [7, 2013], [8, 2014], [9, 2015], [10, 2016], [11, 2017], [12, 2018],
  [13, 2019], [14, 2019], [15, 2020], [16, 2021], [17, 2022]
]);

function decodeEntities (value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function textContent (html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractLinks (html) {
  const links = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const attrs = match[1];
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    if (!hrefMatch || !/\.pdf(?:[?#]|$)/i.test(hrefMatch[2])) continue;
    const href = decodeEntities(hrefMatch[2].trim());
    const url = new URL(href, SOURCE_BASE).href;
    const pathname = new URL(url).pathname;
    const setMatch = pathname.match(/\/Sample-Set-(\d+)\//i);
    if (!setMatch) throw new Error(`PDF link has no Sample-Set-N path: ${href}`);
    const setNumber = Number(setMatch[1]);
    const filename = path.posix.basename(pathname);
    const label = textContent(match[2]);
    const supplemental = /energy/i.test(filename) || /sample energy questions/i.test(label);
    const roundMatch = label.match(/\bRound\s+(\d+)\b/i) ?? filename.match(/(?:round|rd|set)[-_ ]?(\d+)/i);

    links.push({
      source_id: `nsb-hs:${setNumber}:${supplemental ? 'supplement' : `round-${roundMatch?.[1] ?? 'unknown'}`}`,
      source_page_url: SOURCE_PAGE,
      source_file_url: url,
      source_filename: filename,
      source_set_number: setNumber,
      source_round_label: label || null,
      source_round_number: supplemental || !roundMatch ? null : Number(roundMatch[1]),
      source_year: YEARS.get(setNumber) ?? null,
      supplemental,
      source_kind: supplemental ? 'category-supplement' : 'round'
    });
  }
  return links;
}

function validateManifest (items) {
  const urlCounts = new Map();
  const ids = new Set();
  for (const item of items) {
    urlCounts.set(item.source_file_url, (urlCounts.get(item.source_file_url) ?? 0) + 1);
    if (ids.has(item.source_id)) throw new Error(`Duplicate source identity: ${item.source_id}`);
    ids.add(item.source_id);
  }
  const duplicateUrls = [...urlCounts].filter(([, count]) => count > 1).map(([url]) => url);
  if (duplicateUrls.length) throw new Error(`Duplicate PDF URLs (${duplicateUrls.length}):\n${duplicateUrls.join('\n')}`);
  return {
    source_page_url: SOURCE_PAGE,
    source_base_url: SOURCE_ROOT,
    count: items.length,
    items
  };
}

export function buildNsbSourceManifest (html) {
  return validateManifest(extractLinks(html));
}

async function main () {
  const [input, output] = process.argv.slice(2);
  if (!input || process.argv.includes('--help')) {
    console.log('Usage: node tools/import/nsb-source-manifest.js <page.html> [manifest.json]');
    process.exitCode = input ? 0 : 2;
    return;
  }
  const resolvedInput = path.resolve(input);
  const manifest = buildNsbSourceManifest(fs.readFileSync(resolvedInput, 'utf8'));
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (output) fs.writeFileSync(path.resolve(output), json);
  else process.stdout.write(json);
  console.error(`Extracted ${manifest.count} unique PDF links from ${resolvedInput}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
