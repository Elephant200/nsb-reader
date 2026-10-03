import { query } from '../postgres.js';

/**
 * @param {string} setName - the name of the set (e.g. "2026 NSB Regionals").
 * @returns {Promise<Number>} the number of packets in the set.
 */
async function getNumPackets (setName) {
  if (!setName) {
    return 0;
  }

  const { rows } = await query(`
    select count(*)::int as count
    from packets p
    join sets s on s.id = p.set_id
    where s.name = $1
  `, [setName]);

  return rows[0]?.count ?? 0;
}

export default getNumPackets;
