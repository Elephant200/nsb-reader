import { query } from '../postgres.js';
import { mapBonusRow, packetJoinSql, questionSelectSql } from './sql.js';

/**
 * @param {string} _id - the id of the bonus
 * @returns {Promise<import('../../types.js').Bonus | null>}
 */
async function getBonus (_id) {
  if (_id && typeof _id === 'object') { _id = _id._id; }
  if (!_id) { return null; }

  const { rows } = await query(`
    select ${questionSelectSql()}
    ${packetJoinSql('bonuses')}
    where q.id = $1
  `, [_id]);

  return mapBonusRow(rows[0]);
}

export default getBonus;
