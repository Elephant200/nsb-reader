import fs from 'node:fs';

const directory = 'data/nsb/audit';
const corpus = JSON.parse(fs.readFileSync('data/nsb/sample-questions.json', 'utf8'));
const names = fs.readdirSync(directory).filter(name => /^triage-(?:(?:quantitative|molecular|natural)(?:-expansion)?|modern-math-expansion|physics-expansion|reading-residual|sample-rechecks|math-sample-recheck|root-source-checks|chemistry-remaining-[abc])\.json$/.test(name)).sort();
const reviews = new Map();
const sampled = new Set();
for (const name of names) {
  const report = JSON.parse(fs.readFileSync(`${directory}/${name}`, 'utf8'));
  for (const entry of report.entries) {
    const key = `${entry.p}/${entry.k}/${entry.i}`;
    if (['triage-quantitative.json', 'triage-molecular.json', 'triage-natural.json'].includes(name)) sampled.add(key);
    const previous = reviews.get(key);
    reviews.set(key, { ...entry, corrected: entry.status === 'corrected' || previous?.corrected === true, reports: [...(previous?.reports ?? []), name] });
  }
}
const categories = new Map();
const categoryName = name => name.replace(/^\)\s*/, '').replace(/^MATH$/i, 'Math').replace(/^Earth\s*(?:&|ande?)\s*Space.*$/i, 'Earth and Space');
for (const packet of corpus.packets) {
  for (const kind of ['tossups', 'bonuses']) {
    for (const question of packet[kind]) {
      const name = categoryName(question.category);
      const row = categories.get(name) ?? { category: name, corpus: 0, sampled: 0, sampleCorrections: 0, reviewed: 0, corrections: 0, years: {} };
      row.corpus++;
      categories.set(name, row);
    }
  }
}
for (const [key, review] of reviews) {
  const question = corpus.packets[review.p][review.k][review.i];
  const row = categories.get(categoryName(question.category));
  row.reviewed++;
  row.corrections += Number(review.corrected);
  row.sampled += Number(sampled.has(key));
  row.sampleCorrections += Number(sampled.has(key) && review.corrected);
  const year = row.years[review.year] ?? { reviewed: 0, corrections: 0 };
  year.reviewed++;
  year.corrections += Number(review.corrected);
  row.years[review.year] = year;
}
const rows = [...categories.values()].sort((a, b) => a.category.localeCompare(b.category));
const summary = {
  updatedAt: new Date().toISOString(),
  scope: 'Fresh stratified source-PDF review and targeted expansion; identities counted once. Corrections include later findings in the original sample. Additional reader-field consistency repairs are separate.',
  sampled: sampled.size,
  reviewed: reviews.size,
  corrections: rows.reduce((sum, row) => sum + row.corrections, 0),
  readingConsistencyRepairs: 281,
  categories: rows,
  reports: names
};
fs.writeFileSync(`${directory}/triage-summary.json`, JSON.stringify(summary, null, 2) + '\n');
const table = ['| Category | Sample reviewed | Sample corrections | Total reviewed | Corrections | Corpus |', '| --- | ---: | ---: | ---: | ---: | ---: |', ...rows.map(row => `| ${row.category} | ${row.sampled} | ${row.sampleCorrections} | ${row.reviewed} | ${row.corrections} | ${row.corpus} |`)];
fs.writeFileSync(`${directory}/triage-summary.md`, `# NSB source review\n\n${summary.scope}\n\n${table.join('\n')}\n\n${summary.reviewed} unique questions reviewed; ${summary.corrections} source-review corrections. Separately, ${summary.readingConsistencyRepairs} questions had reader text aligned with existing source-reviewed display notation and exponent token boundaries.\n\nDetailed per-year counts and report names are in [triage-summary.json](triage-summary.json). Before/after corrections are in [corrections.json](corrections.json).\n`);
console.log(`${summary.reviewed} unique questions; ${summary.corrections} source-review corrections.`);
