import { query } from '../postgres.js';
import { mapTossupRow, packetJoinSql, questionSelectSql } from './sql.js';

/**
 * @param {string} _id - the id of the tossup
 * @returns {Promise<import('../../types.js').Tossup | null>}
 */
async function getTossup (_id) {
  if (_id && typeof _id === 'object') { _id = _id._id; }
  if (!_id) { return null; }

  const { rows } = await query(`
    select ${questionSelectSql()}
    ${packetJoinSql('tossups')}
    where q.id = $1
  `, [_id]);

  return mapTossupRow(rows[0]);
}

export default getTossup;
