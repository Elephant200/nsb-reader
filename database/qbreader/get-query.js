import { query } from '../postgres.js';

import unformatString from '../../shared/unformat-string.js';
import { DEFAULT_QUERY_RETURN_LENGTH, MAX_QUERY_RETURN_LENGTH } from '../../shared/constants.js';
import {
  buildQuestionFilters,
  mapBonusRow,
  mapTossupRow,
  packetJoinSql,
  questionOrderSql,
  questionSelectSql
} from './sql.js';

function escapeRegExp (string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateOptions ({
  queryString,
  setName,
  searchType = 'all',
  questionType = 'all',
  categories,
  subcategories,
  alternateSubcategories,
  maxReturnLength = DEFAULT_QUERY_RETURN_LENGTH,
  randomize = false,
  regex = false,
  ignoreWordOrder = false,
  exactPhrase = false,
  caseSensitive = false,
  tossupPagination = 1,
  bonusPagination = 1,
  minYear,
  maxYear,
  verbose = false
}) {
  let words;

  maxReturnLength = Math.min(maxReturnLength, MAX_QUERY_RETURN_LENGTH);

  if (maxReturnLength <= 0) {
    maxReturnLength = DEFAULT_QUERY_RETURN_LENGTH;
  }

  if (!queryString) {
    queryString = '';
  }

  if (!questionType) {
    questionType = 'all';
  } else if (!['tossup', 'bonus', 'all'].includes(questionType)) {
    throw new Error('Invalid question type specified.');
  }

  if (regex) {
    exactPhrase = false;
    ignoreWordOrder = false;
  } else {
    queryString = queryString.trim();
    queryString = unformatString(queryString);
    queryString = escapeRegExp(queryString);
  }

  if (ignoreWordOrder) {
    words = queryString.split(' ').filter(word => word !== '');
  } else {
    words = [queryString].filter(word => word !== '');
  }

  if (exactPhrase && !regex) {
    words = words.map(word => `\\m${word}\\M`);
  }

  if (!searchType) {
    searchType = 'all';
  } else if (!['question', 'answer', 'exactAnswer', 'all'].includes(searchType)) {
    throw new Error('Invalid search type specified.');
  }

  if (alternateSubcategories) {
    alternateSubcategories = alternateSubcategories.concat([null]);
  }

  return { queryString, setName, searchType, questionType, categories, subcategories, alternateSubcategories, maxReturnLength, randomize, regex, exactPhrase, caseSensitive, tossupPagination, bonusPagination, minYear, maxYear, verbose, words };
}

function addSearchClauses ({ fields, values, words, searchType, caseSensitive, exactAnswer }, startIndex) {
  const clauses = [];
  let index = startIndex;
  const operator = caseSensitive ? '~' : '~*';

  for (const word of words) {
    const orClauses = [];
    const pattern = exactAnswer ? `^\\s*${word}\\s*(\\[.*|\\(.*)?$` : word;

    for (const field of fields) {
      if (field.kind === 'question' && !['question', 'all'].includes(searchType)) { continue; }
      if (field.kind === 'answer' && !['answer', 'exactAnswer', 'all'].includes(searchType)) { continue; }
      orClauses.push(`${field.sql} ${operator} $${index++}`);
      values.push(pattern);
    }

    if (orClauses.length) {
      clauses.push(`(${orClauses.join(' or ')})`);
    }
  }

  return { clauses, nextIndex: index };
}

async function getQuestionQuery ({ table, mapper, fields, pagination, options }) {
  const baseFilters = buildQuestionFilters(options);
  const values = baseFilters.values.slice();
  const clauses = [];

  if (baseFilters.whereSql) {
    clauses.push(baseFilters.whereSql.replace(/^where /, ''));
  }

  const search = addSearchClauses({
    caseSensitive: options.caseSensitive,
    exactAnswer: options.searchType === 'exactAnswer',
    fields,
    searchType: options.searchType,
    values,
    words: options.words
  }, baseFilters.nextIndex);

  clauses.push(...search.clauses);

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const countValues = values.slice();
  const limitIndex = search.nextIndex;
  const offsetIndex = search.nextIndex + 1;
  const offset = (pagination - 1) * options.maxReturnLength;
  const orderSql = options.randomize ? 'order by random()' : questionOrderSql;

  const [questionResult, countResult] = await Promise.all([
    query(`
      select ${questionSelectSql()}
      ${packetJoinSql(table)}
      ${whereSql}
      ${orderSql}
      limit $${limitIndex} offset $${offsetIndex}
    `, values.concat([options.maxReturnLength, offset])),
    query(`
      select count(*)::int as count
      ${packetJoinSql(table)}
      ${whereSql}
    `, countValues)
  ]);

  return {
    count: countResult.rows[0]?.count ?? 0,
    questionArray: questionResult.rows.map(mapper)
  };
}

async function getQuery (options = {}) {
  options = validateOptions(options);

  const tossupQuery = ['tossup', 'all'].includes(options.questionType)
    ? getQuestionQuery({
      fields: [
        { kind: 'question', sql: 'q.question_sanitized' },
        { kind: 'answer', sql: 'q.answer_sanitized' }
      ],
      mapper: mapTossupRow,
      options,
      pagination: options.tossupPagination,
      table: 'tossups'
    })
    : null;

  const bonusQuery = ['bonus', 'all'].includes(options.questionType)
    ? getQuestionQuery({
      fields: [
        { kind: 'question', sql: 'q.leadin_sanitized' },
        { kind: 'question', sql: "array_to_string(q.parts_sanitized, ' ')" },
        { kind: 'answer', sql: "array_to_string(q.answers_sanitized, ' ')" }
      ],
      mapper: mapBonusRow,
      options,
      pagination: options.bonusPagination,
      table: 'bonuses'
    })
    : null;

  const values = await Promise.all([tossupQuery, bonusQuery]);

  return {
    tossups: values[0] ?? { count: 0, questionArray: [] },
    bonuses: values[1] ?? { count: 0, questionArray: [] },
    queryString: options.queryString
  };
}

export default getQuery;
