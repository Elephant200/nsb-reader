import { query } from '../postgres.js';
import { CATEGORIES, SUBCATEGORIES } from '../../shared/categories.js';
import { DEFAULT_MAX_YEAR, DEFAULT_MIN_YEAR } from '../../shared/constants.js';
import { buildQuestionFilters, mapTossupRow, packetJoinSql, questionSelectSql } from './sql.js';

/**
 * Get an array of random tossups.
 */
async function getRandomTossups ({
  categories = CATEGORIES,
  subcategories = SUBCATEGORIES,
  alternateSubcategories = [],
  number = 1,
  minYear = DEFAULT_MIN_YEAR,
  maxYear = DEFAULT_MAX_YEAR
} = {}) {
  const filters = buildQuestionFilters({
    alternateSubcategories,
    categories,
    maxYear,
    minYear,
    subcategories
  });

  const { rows } = await query(`
    select ${questionSelectSql()}
    ${packetJoinSql('tossups')}
    ${filters.whereSql}
    order by random()
    limit $${filters.nextIndex}
  `, filters.values.concat([number]));

  return rows.map(mapTossupRow);
}

export default getRandomTossups;
