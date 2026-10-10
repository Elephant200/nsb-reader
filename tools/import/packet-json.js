import unformatString from '../../shared/unformat-string.js';

function requireString (value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} missing ${label.split(' ').at(-1)}`);
  }
  return value.replace(/ {2,}/g, ' ').trim();
}

function cleanText (value) {
  return requireString(value, 'field text');
}

function cleanSanitizedText (value, fallback) {
  let text = (typeof value === 'string' && value.trim()) ? value : fallback;
  const powers = { sup: '⁰¹²³⁴⁵⁶⁷⁸⁹', sub: '₀₁₂₃₄₅₆₇₈₉' };
  const symbols = { sup: { '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾' }, sub: { '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎' } };
  const convertPower = (value, type) => {
    value = value.trim().replace(/−/g, '-').replace(/\((\d+)\)\/\((\d+)\)/g, '$1/$2');
    if (!value) return '';
    if (!/^[\d+\-=()]+$/.test(value)) return `${type === 'sup' ? '^' : '_'}(${value.replace(/[ \t]+/g, '\u00a0')})`;
    return [...value].map(char => /\d/.test(char) ? powers[type][Number(char)] : symbols[type][char]).join('');
  };
  // Work from inner to outer powers; flattening nested or fractional exponents
  // would change their meaning in progressive reading and answer checking.
  text = text.replace(/(\d)<sup>(st|nd|rd|th)<\/sup>/gi, '$1$2');
  let previous;
  do {
    previous = text;
    text = text
      .replace(/<span class=["']nsb-fraction["']><span>((?:(?!<\/?span\b)[\s\S])*?)<\/span><span>((?:(?!<\/?span\b)[\s\S])*?)<\/span><\/span>/gi, '($1)/($2)')
      .replace(/<(sup|sub)>([^<]*)<\/\1>/gi, (_, type, value) => convertPower(value, type.toLowerCase()));
  } while (text !== previous);
  return unformatString(text
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<span class=["']nsb-fraction["']><span>([\s\S]*?)<\/span><span>([\s\S]*?)<\/span><\/span>/gi, '($1)/($2)')
    .replace(/<\/?(?:b|strong|em|i|sup|sub)\s*>/gi, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/gi, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity.toLowerCase()])), { preserveMath: true });
}

function sourceNumber (item, index, kind) {
  const value = item.number ?? index + 1;
  const number = parseInt(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${kind} ${index + 1} has invalid source number`);
  return number;
}

function normalizeTossup (tossup, index, difficulty) {
  for (const field of ['question', 'answer', 'category']) {
    if (typeof tossup[field] !== 'string' || tossup[field].trim() === '') {
      throw new Error(`tossup ${index + 1} missing ${field}`);
    }
  }

  const question = cleanText(tossup.question);
  const answer = cleanText(tossup.answer);
  const sanitizedQuestionFallback = question;

  return {
    number: sourceNumber(tossup, index, 'tossup'),
    question,
    question_sanitized: cleanSanitizedText(tossup.question_sanitized, sanitizedQuestionFallback),
    answer,
    answer_sanitized: cleanSanitizedText(tossup.answer_sanitized, answer),
    category: tossup.category.trim(),
    difficulty
  };
}

function normalizeBonus (bonus, index, difficulty) {
  for (const field of ['category']) {
    if (typeof bonus[field] !== 'string' || bonus[field].trim() === '') {
      throw new Error(`bonus ${index + 1} missing ${field}`);
    }
  }
  if (typeof bonus.leadin !== 'string') {
    throw new Error(`bonus ${index + 1} missing leadin`);
  }

  for (const field of ['parts', 'answers']) {
    if (!Array.isArray(bonus[field]) || bonus[field].length === 0) {
      throw new Error(`bonus ${index + 1} missing ${field}`);
    }
  }

  const leadin = bonus.leadin.trim() ? cleanText(bonus.leadin) : '';
  const parts = bonus.parts.map(part => cleanText(part));
  const answers = bonus.answers.map(answer => cleanText(answer));

  return {
    number: sourceNumber(bonus, index, 'bonus'),
    leadin,
    leadin_sanitized: leadin ? cleanSanitizedText(bonus.leadin_sanitized, leadin) : '',
    parts,
    parts_sanitized: Array.isArray(bonus.parts_sanitized)
      ? bonus.parts_sanitized.map((part, i) => cleanSanitizedText(part, parts[i]))
      : parts.map(part => cleanSanitizedText(part, part)),
    answers,
    answers_sanitized: Array.isArray(bonus.answers_sanitized)
      ? bonus.answers_sanitized.map((answer, i) => cleanSanitizedText(answer, answers[i]))
      : answers.map(answer => cleanSanitizedText(answer, answer)),
    values: Array.isArray(bonus.values) ? bonus.values.map(value => parseInt(value)).filter(value => !isNaN(value)) : null,
    category: bonus.category.trim(),
    difficulty
  };
}

export function normalizePacketJson ({
  data,
  difficulty,
  packetName,
  packetNumber,
  setName,
  sourceFile,
  standard = true,
  year: yearOverride
}) {
  if (!data || !Array.isArray(data.tossups) || !Array.isArray(data.bonuses)) {
    throw new Error('packet JSON must contain tossups and bonuses arrays');
  }

  if (typeof setName !== 'string' || setName.trim() === '') {
    throw new Error('setName is required');
  }

  if (typeof packetName !== 'string' || packetName.trim() === '') {
    throw new Error('packetName is required');
  }

  packetNumber = parseInt(packetNumber);
  difficulty = parseInt(difficulty);

  if (isNaN(packetNumber) || packetNumber < 1) {
    throw new Error('packetNumber must be a positive integer');
  }

  if (isNaN(difficulty)) {
    throw new Error('difficulty must be an integer');
  }

  const yearMatch = setName.match(/\b(19|20)\d{2}\b/);
  const year = yearOverride ?? (yearMatch ? parseInt(yearMatch[0]) : null);

  return {
    set: {
      name: setName.trim(),
      year,
      difficulty,
      standard: !!standard
    },
    packet: {
      name: packetName.trim(),
      number: packetNumber,
      source_file: sourceFile ?? null
    },
    tossups: data.tossups.map((tossup, index) => normalizeTossup(tossup, index, difficulty)),
    bonuses: data.bonuses.map((bonus, index) => normalizeBonus(bonus, index, difficulty))
  };
}
