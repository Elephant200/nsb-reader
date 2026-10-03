import { query } from '../postgres.js';

/**
 * Retrieves metadata for NSB sets with optional question counts.
 */
export default async function getSetMetadata ({ limit, includeCounts = true } = {}) {
  const limitSql = isFinite(limit) && limit > 0 ? 'limit $1' : '';
  const values = limitSql ? [limit] : [];
  const countSql = includeCounts
    ? `,
      count(distinct p.id)::int as "packetsCount",
      count(distinct t.id)::int as "tossupsCount",
      count(distinct b.id)::int as "bonusesCount"`
    : '';
  const joinSql = includeCounts
    ? `
      left join packets p on p.set_id = s.id
      left join tossups t on t.set_id = s.id
      left join bonuses b on b.set_id = s.id`
    : '';

  const { rows } = await query(`
    select
      s.id as _id,
      s.name as "setName",
      s.difficulty,
      s.standard,
      s.year
      ${countSql}
    from sets s
    ${joinSql}
    group by s.id
    order by s.year desc, s.name asc
    ${limitSql}
  `, values);

  return rows;
}
