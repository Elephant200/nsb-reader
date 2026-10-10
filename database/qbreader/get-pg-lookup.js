import { query } from '../postgres.js';
import { mapBonusRow, mapTossupRow, packetJoinSql, questionOrderSql, questionSelectSql } from './sql.js';

function escapeRegExp (string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Look up pronunciation guides for a given word or phrase.
 */
export default async function getPgLookup ({ word, limit = 50 }) {
  if (word === '') { return { tossups: [], bonuses: [] }; }

  const escapedWord = escapeRegExp(word);
  const sanitizedRegex = `\\m${escapedWord}\\s*\\("([^"]*)"\\)`;

  function extractPronunciationGuide (text) {
    const match = text.match(new RegExp(`\\b${escapedWord}\\s*\\("([^"]*)"\\)`, 'i'));
    return match?.at(1) ?? null;
  }

  limit = Math.min(limit, 200);

  const [tossupResults, bonusResults] = await Promise.all([
    query(`
      select ${questionSelectSql()}
      ${packetJoinSql('tossups')}
      where q.question_sanitized ~* $1
      ${questionOrderSql}
      limit $2
    `, [sanitizedRegex, limit]),
    query(`
      select ${questionSelectSql()}
      ${packetJoinSql('bonuses')}
      where q.leadin_sanitized ~* $1 or array_to_string(q.parts_sanitized, ' ') ~* $1
      ${questionOrderSql}
      limit $2
    `, [sanitizedRegex, limit])
  ]);

  const tossups = tossupResults.rows.map(row => {
    const tossup = mapTossupRow(row);
    return { ...tossup, pg: extractPronunciationGuide(tossup.question_sanitized) };
  });

  const bonuses = bonusResults.rows.map(row => {
    const bonus = mapBonusRow(row);
    const allText = [bonus.leadin_sanitized, ...(bonus.parts_sanitized ?? [])].join(' ');
    return { ...bonus, pg: extractPronunciationGuide(allText) };
  });

  return { tossups, bonuses };
}
