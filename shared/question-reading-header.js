import { escapeHTML } from './string-utils.js';

export function questionReadingHeader (category, question, answer) {
  const multipleChoice = /(?:^|\n|<br\s*\/?\s*>)\s*W\)/i.test(question) || /^\s*(?:<[^>]+>)*[WXYZ]\)/i.test(answer);
  return `${category || 'General Science'} — ${multipleChoice ? 'Multiple Choice' : 'Short Answer'}.`;
}

export function withTossupReadingHeader (tossup) {
  const header = questionReadingHeader(tossup.category, tossup.question, tossup.answer);
  return {
    ...tossup,
    question: `${escapeHTML(header)}<br>${tossup.question}`,
    question_sanitized: `${header}\n${tossup.question_sanitized}`
  };
}

export function withBonusReadingHeader (bonus) {
  const headers = bonus.parts.map((part, i) => questionReadingHeader(bonus.category, part, bonus.answers[i]));
  return {
    ...bonus,
    parts: bonus.parts.map((part, i) => `${escapeHTML(headers[i])}<br>${part}`),
    parts_sanitized: bonus.parts_sanitized.map((part, i) => `${headers[i]}\n${part}`)
  };
}
