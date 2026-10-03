import { query } from '../postgres.js';
import { CATEGORIES, SUBCATEGORIES } from '../../shared/categories.js';
import { DEFAULT_MAX_YEAR, DEFAULT_MIN_YEAR } from '../../shared/constants.js';
import { buildQuestionFilters, mapBonusRow, packetJoinSql, questionSelectSql } from './sql.js';

/**
 * Get an array of random bonuses.
 */
async function getRandomBonuses ({
  categories = CATEGORIES,
  subcategories = SUBCATEGORIES,
  alternateSubcategories = [],
  number = 1,
  minYear = DEFAULT_MIN_YEAR,
  maxYear = DEFAULT_MAX_YEAR,
  bonusLength
} = {}) {
  const filters = buildQuestionFilters({
    alternateSubcategories,
    categories,
    maxYear,
    minYear,
    subcategories
  });

  if (bonusLength && !isNaN(bonusLength)) {
    filters.whereSql += filters.whereSql ? ' and ' : 'where ';
    filters.whereSql += `cardinality(q.parts) = $${filters.nextIndex}`;
    filters.values.push(parseInt(bonusLength));
    filters.nextIndex++;
  }

  const { rows } = await query(`
    select ${questionSelectSql()}
    ${packetJoinSql('bonuses')}
    ${filters.whereSql}
    order by random()
    limit $${filters.nextIndex}
  `, filters.values.concat([number]));

  return rows.map(mapBonusRow);
}

export default getRandomBonuses;
