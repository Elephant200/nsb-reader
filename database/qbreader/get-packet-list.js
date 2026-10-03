import { query } from '../postgres.js';

/**
 * Retrieves the list of packets for a given set name, sorted by packet number.
 *
 * @param {string} setName - The name of the set to retrieve packets from.
 * @returns {Promise<{number: number, name: string}[]>}
 */
export default async function getPacketList (setName) {
  if (!setName) { return []; }

  const { rows } = await query(`
    select p.number, p.name
    from packets p
    join sets s on s.id = p.set_id
    where s.name = $1
    order by p.number asc
  `, [setName]);

  return rows;
}
