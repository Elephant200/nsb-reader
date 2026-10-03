import { query } from '../postgres.js';

/**
 * @returns {Promise<string[]>} an array of all the set names.
 */
async function getSetList () {
  const { rows } = await query('select name from sets order by year desc, name asc');
  return rows.map(set => set.name);
}

export default getSetList;
