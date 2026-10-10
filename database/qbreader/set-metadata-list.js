import { query } from '../postgres.js';

export default async function getSetMetadata ({ limit = 10000, includeCounts = false } = {}) {
  const counts = includeCounts
    ? `,
    (select count(*)::int from packets where set_id = s.id) as "packetsCount",
    (select count(*)::int from tossups where set_id = s.id) as "tossupsCount",
    (select count(*)::int from bonuses where set_id = s.id) as "bonusesCount"`
    : '';
  const { rows } = await query(`
    select s.id as _id, s.name as "setName", s.difficulty, s.standard, s.year
    ${counts}
    from sets s
    order by s.year desc, s.name asc
    limit $1
  `, [Math.max(1, Math.min(Number(limit) || 10000, 10000))]);
  return rows;
}
