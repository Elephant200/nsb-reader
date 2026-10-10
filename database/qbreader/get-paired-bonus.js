import { query } from '../postgres.js';
import { mapBonusRow, packetJoinSql, questionSelectSql } from './sql.js';

export default async function getPairedBonus (packetId, number) {
  if (!packetId || isNaN(number)) return null;
  const { rows } = await query(`
    select ${questionSelectSql()}
    ${packetJoinSql('bonuses')}
    where q.packet_id = $1 and q.number = $2
    limit 1
  `, [packetId, parseInt(number)]);
  return rows.length ? mapBonusRow(rows[0]) : null;
}
