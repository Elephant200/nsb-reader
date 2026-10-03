import { query } from '../postgres.js';

export default async function reportQuestion (id, reason, description) {
  const { rowCount } = await query(`
    insert into question_reports (question_id, question_type, reason, description)
    select id, 'tossup', $2, $3 from tossups where id = $1
    union all
    select id, 'bonus', $2, $3 from bonuses where id = $1
  `, [id, reason, description]);
  return rowCount > 0;
}
