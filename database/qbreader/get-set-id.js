import { query } from '../postgres.js';

/**
 * @param {string} name - the name of the set
 * @returns {Promise<string | null>}
 */
async function getSetId (name) {
  const { rows } = await query('select id from sets where name = $1', [name]);
  return rows[0]?.id ?? null;
}

export default getSetId;
