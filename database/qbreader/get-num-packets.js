import { query } from '../postgres.js';

/**
 * @param {string} setName - the name of the set (e.g. "2026 NSB Regionals").
 * @returns {Promise<Number>} the highest packet number, used as the selection range.
 */
async function getNumPackets (setName) {
  if (!setName) {
    return 0;
  }

  const { rows } = await query(`
    select coalesce(max(p.number), 0)::int as count
    from packets p
    join sets s on s.id = p.set_id
    where s.name = $1
  `, [setName]);

  return rows[0]?.count ?? 0;
}

export default getNumPackets;
