import { query } from '../postgres.js';

import { CATEGORIES, SUBCATEGORIES } from '../../shared/categories.js';
import { buildQuestionFilters, mapBonusRow, mapTossupRow, packetJoinSql, questionSelectSql } from './sql.js';

/**
 * Gets all questions in a set that satisfy the given parameters.
 */
async function getSet ({ setName, packetNumbers, categories, subcategories, questionType = 'tossup', reverse = false }) {
  if (!setName) return [];

  if (!categories || categories.length === 0) categories = CATEGORIES;
  if (!subcategories || subcategories.length === 0) subcategories = SUBCATEGORIES;
  if (!questionType) questionType = 'tossup';

  const filters = buildQuestionFilters({ categories, setName, subcategories });
  let whereSql = filters.whereSql;
  const values = filters.values.slice();
  let nextIndex = filters.nextIndex;

  if (packetNumbers?.length) {
    whereSql += whereSql ? ' and ' : 'where ';
    whereSql += `p.number = any($${nextIndex++})`;
    values.push(packetNumbers);
  }

  const direction = reverse ? 'desc' : 'asc';
  const table = questionType === 'bonus' ? 'bonuses' : 'tossups';
  const mapper = questionType === 'bonus' ? mapBonusRow : mapTossupRow;

  const { rows } = await query(`
    select ${questionSelectSql()}
    ${packetJoinSql(table)}
    ${whereSql}
    order by p.number ${direction}, q.number ${direction}
  `, values);

  return rows.map(mapper);
}

export default getSet;
