function toIsoString (value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function cleanArray (value) {
  return Array.isArray(value) ? value.filter(item => item !== undefined && item !== null && item !== '') : [];
}

export function buildQuestionFilters ({
  categories,
  maxYear,
  minYear,
  setName
} = {}, startIndex = 1) {
  const clauses = [];
  const values = [];
  let index = startIndex;

  function addArrayClause (sql, items) {
    const array = cleanArray(items);
    if (!array.length) { return; }
    clauses.push(sql.replace('?', `$${index++}`));
    values.push(array);
  }

  addArrayClause('q.category = any(?)', categories);

  const setNames = cleanArray(Array.isArray(setName) ? setName : setName ? [setName] : []);
  if (setNames.length) {
    clauses.push(`s.name = any($${index++})`);
    values.push(setNames);
  }

  if (minYear) {
    clauses.push(`s.year >= $${index++}`);
    values.push(minYear);
  }

  if (maxYear) {
    clauses.push(`s.year <= $${index++}`);
    values.push(maxYear);
  }

  return {
    nextIndex: index,
    values,
    whereSql: clauses.length ? `where ${clauses.join(' and ')}` : ''
  };
}

export function packetJoinSql (questionTable) {
  return `
    from ${questionTable} q
    join packets p on p.id = q.packet_id
    join sets s on s.id = q.set_id
  `;
}

export const questionOrderSql = 'order by s.name desc, p.number asc, q.number asc';

export function mapTossupRow (row) {
  if (!row) { return null; }

  return {
    _id: row.id,
    number: row.number,
    question: row.question,
    question_sanitized: row.question_sanitized,
    answer: row.answer,
    answer_sanitized: row.answer_sanitized,
    category: row.category,
    difficulty: row.difficulty,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    packet: {
      _id: row.packet_id,
      name: row.packet_name,
      number: row.packet_number
    },
    set: {
      _id: row.set_id,
      name: row.set_name,
      year: row.set_year,
      standard: row.set_standard
    }
  };
}

export function mapBonusRow (row) {
  if (!row) { return null; }

  return {
    _id: row.id,
    number: row.number,
    leadin: row.leadin,
    leadin_sanitized: row.leadin_sanitized,
    parts: row.parts,
    parts_sanitized: row.parts_sanitized,
    answers: row.answers,
    answers_sanitized: row.answers_sanitized,
    values: row.values,
    category: row.category,
    difficulty: row.difficulty,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    packet: {
      _id: row.packet_id,
      name: row.packet_name,
      number: row.packet_number
    },
    set: {
      _id: row.set_id,
      name: row.set_name,
      year: row.set_year,
      standard: row.set_standard
    }
  };
}

export function questionSelectSql (extraColumns = '') {
  return `
    q.*,
    p.id as packet_id,
    p.name as packet_name,
    p.number as packet_number,
    s.id as set_id,
    s.name as set_name,
    s.year as set_year,
    s.standard as set_standard
    ${extraColumns}
  `;
}
