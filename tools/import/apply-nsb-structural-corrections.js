import fs from 'node:fs';

export const structuralCorrections = JSON.parse(fs.readFileSync(new URL('./nsb-structural-corrections.json', import.meta.url), 'utf8'));

/**
 * Recovers source questions whose missing or misspelled headers broke extraction.
 * The raw corpus retains its stable audit identities; import receives repaired pairs.
 * @param {string} sourceUrl
 * @param {{tossups: Object[], bonuses: Object[]}} packet
 * @returns {{tossups: Object[], bonuses: Object[]}}
 */
export default function applyNsbStructuralCorrections (sourceUrl, packet) {
  const rules = structuralCorrections.filter(rule => rule.sourceUrl === sourceUrl);
  if (!rules.length) return packet;
  const result = { tossups: [...packet.tossups], bonuses: [...packet.bonuses] };
  for (const rule of rules) {
    const existing = result.tossups.filter(item => item.number === rule.number);
    if (rule.operation === 'add-tossup') {
      if (existing.length === 1 && existing[0].question === rule.question.question) continue;
      if (existing.length) throw new Error(`Structural recovery conflicts with toss-up ${rule.number}: ${sourceUrl}`);
      result.tossups.push(structuredClone(rule.question));
    } else if (rule.operation === 'bonus-to-tossup') {
      const matches = result.bonuses.filter(item => item.number === rule.number && item.parts?.[0]?.split('<br>')[0] === rule.matchPrompt);
      if (!matches.length && existing.length === 1 && existing[0].question.split('<br>')[0] === rule.matchPrompt) continue;
      if (matches.length !== 1 || existing.length) throw new Error(`Ambiguous structural recovery for question ${rule.number}: ${sourceUrl}`);
      const bonus = matches[0];
      if (bonus.parts.length !== 1 || bonus.answers.length !== 1) throw new Error('Recovered toss-up must have one prompt and answer');
      const common = Object.fromEntries(Object.entries(bonus).filter(([field]) => !['leadin', 'leadin_sanitized', 'parts', 'parts_sanitized', 'answers', 'answers_sanitized', 'values'].includes(field)));
      result.tossups.push({ ...common, question: bonus.parts[0], answer: bonus.answers[0], ...(bonus.parts_sanitized ? { question_sanitized: bonus.parts_sanitized[0] } : {}), ...(bonus.answers_sanitized ? { answer_sanitized: bonus.answers_sanitized[0] } : {}) });
      result.bonuses = result.bonuses.filter(item => item !== bonus);
    } else throw new Error(`Unknown structural recovery operation: ${rule.operation}`);
  }
  result.tossups.sort((a, b) => a.number - b.number);
  return result;
}
