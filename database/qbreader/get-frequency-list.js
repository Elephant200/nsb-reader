import { query } from '../postgres.js';

function addSharedFilters ({ category, maxYear, minYear }, values) {
  const clauses = [];
  let index = values.length + 1;

  if (category) {
    clauses.push(`q.category = $${index++}`);
    values.push(category);
  }
  if (minYear) {
    clauses.push(`s.year >= $${index++}`);
    values.push(minYear);
  }
  if (maxYear) {
    clauses.push(`s.year <= $${index++}`);
    values.push(maxYear);
  }

  return clauses.length ? `where ${clauses.join(' and ')}` : '';
}

function normalizeAnswerExpression (fieldSql) {
  return `lower(replace(trim(regexp_replace(split_part(${fieldSql}, '(', 1), '\\[.*$', '')), '-', ' '))`;
}

async function runFrequencyQuery ({ answerSql, fromSql, params, limit }) {
  const values = [];
  const whereSql = addSharedFilters(params, values);
  const limitSql = limit ? `limit $${values.length + 1}` : '';
  if (limit) { values.push(limit); }

  const { rows } = await query(`
    select answer, count(*)::int as count
    from (
      select ${normalizeAnswerExpression(answerSql)} as answer
      ${fromSql}
      ${whereSql}
    ) answers
    where answer is not null and answer <> ''
    group by answer
    order by count desc, answer asc
    ${limitSql}
  `, values);

  return rows;
}

export default async function getFrequencyList (params) {
  const { category, limit, questionType } = params;
  if (!category) { return []; }

  switch (questionType) {
    case 'tossup':
      return await runFrequencyQuery({
        answerSql: 'q.answer_sanitized',
        fromSql: 'from tossups q join sets s on s.id = q.set_id',
        limit,
        params
      });
    case 'bonus':
      return await runFrequencyQuery({
        answerSql: 'answer_sanitized',
        fromSql: 'from bonuses q join sets s on s.id = q.set_id cross join unnest(q.answers_sanitized) answer_sanitized',
        limit,
        params
      });
    case 'all': {
      const [tossups, bonuses] = await Promise.all([
        runFrequencyQuery({
          answerSql: 'q.answer_sanitized',
          fromSql: 'from tossups q join sets s on s.id = q.set_id',
          params
        }),
        runFrequencyQuery({
          answerSql: 'answer_sanitized',
          fromSql: 'from bonuses q join sets s on s.id = q.set_id cross join unnest(q.answers_sanitized) answer_sanitized',
          params
        })
      ]);
      const merged = new Map();
      for (const row of tossups.concat(bonuses)) {
        const current = merged.get(row.answer) ?? 0;
        merged.set(row.answer, current + row.count);
      }
      return [...merged.entries()]
        .map(([answer, count]) => ({ answer, count }))
        .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer))
        .slice(0, limit || undefined);
    }
    default:
      throw new Error('Invalid question type');
  }
}
