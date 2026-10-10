import fs from 'node:fs';

const directory = 'data/nsb/audit';
const summary = JSON.parse(fs.readFileSync(`${directory}/reaudit-2026-10-10-summary.json`, 'utf8'));
const highPriority = new Set(['13/tossups/10', '61/tossups/3', '79/bonuses/10', '88/tossups/2', '94/bonuses/8', '104/bonuses/1', '176/bonuses/12', '188/tossups/20', '206/tossups/22', '248/tossups/11']);
const text = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const priority = issue => issue.resolved ? 'Already corrected' : highPriority.has(`${issue.p}/${issue.k}/${issue.i}`) ? '1 — Answer conflict' : ['wording-caveat', 'answer-policy'].includes(issue.kind) ? '3 — Wording or policy' : '2 — Source review';
const issues = [...summary.sourceIssues].sort((a, b) => priority(a).localeCompare(priority(b)) || a.year - b.year || a.p - b.p || a.number - b.number);
const lines = [
  '# Math and Chemistry repeat audit',
  '',
  `Updated: ${summary.updatedAt}. Reviewed ${summary.reviewed} of ${summary.total}; ${summary.pending} remain.`,
  '',
  '| Category | Total | Reviewed | Corrections | Unresolved source flags |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...summary.categories.map(row => `| ${row.category} | ${row.total} | ${row.reviewed} | ${row.corrected} | ${row.unresolved} |`),
  '',
  'Corrections are differences from the frozen pre-audit corpus and include notation, missing expressions, spelling, and reading text. The before-and-after viewer is available at http://localhost:8792/ under “Repeat Math/Chemistry findings.”',
  '',
  'The table below separates apparent answer conflicts from other source issues and wording or answer-policy caveats. These flags describe the original PDFs; unresolved flags retain their printed content and keys. A flag is a review finding, not an automatically approved replacement answer. Previously corrected source errors are listed separately by status. Other categories remain unchanged in this pass.',
  '',
  '| Priority | Question | Category | Original PDF finding |',
  '| --- | --- | --- | --- |',
  ...issues.map(issue => `| ${priority(issue)} | [${issue.year} Set ${issue.source.setNumber}, Packet ${issue.source.roundNumber}, ${issue.k === 'tossups' ? 'Toss-up' : 'Bonus'} ${issue.number}](${issue.source.url}#page=${issue.sourcePages[0]}) | ${issue.category} | ${text(issue.evidence)} |`),
  '',
  'For the electron-affinity comparison in 2018 Set 12 Packet 7 Toss-up 21, [PubChem’s element data](https://pubchem.ncbi.nlm.nih.gov/periodic-table/electron-affinity/) gives Li 0.618 eV, O 1.461 eV, and S 2.077 eV, supporting Li < O < S. For 2021 Set 16 Packet 10 Toss-up 3, [NIST KCl thermochemistry](https://webbook.nist.gov/cgi/cbook.cgi?ID=C7447407&Mask=2) gives the solid formation enthalpy as −436.68 kJ/mol; further comparison must use consistent phases and reaction conditions.',
  '',
  'Evidence and exact source identities: [summary](reaudit-2026-10-10-summary.json), [audit A](reaudit-2026-10-10-a.json), [audit B](reaudit-2026-10-10-b.json), [audit C](reaudit-2026-10-10-c.json), [redistributed tail](reaudit-2026-10-10-d.json).',
  ''
];
fs.writeFileSync(`${directory}/reaudit-2026-10-10-triage.md`, lines.join('\n'));
console.log(`Wrote triage for ${issues.length} source findings.`);
