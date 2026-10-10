/**
 * Splits a required answer list without splitting coordinates or grouped math.
 * @param {string} text
 * @param {boolean} [includeOr] Only when the key explicitly requires both answers.
 * @param {boolean} [conjunctions] Whether words AND/OR separate components.
 * @returns {string[]}
 */
export default function splitAnswerList (text, includeOr = false, conjunctions = true) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if ('(['.includes(text[i])) depth++;
    else if (')]'.includes(text[i])) depth--;
    const separator = depth === 0 && text.slice(i).match(!conjunctions ? /^(?:;\s*|,\s+|,(?!\d{3}(?:[,.]|$))\s*)/ : includeOr ? /^(?:[,;]\s*(?:(?:AND|OR)\s+)?|\s+(?:AND|OR)\s+)/i : /^(?:[,;]\s*(?:AND\s+)?|\s+AND\s+)/i);
    if (separator) {
      parts.push(text.slice(start, i).trim());
      i += separator[0].length - 1;
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

/**
 * Reads numbered answer components without mistaking their labels for brackets.
 * @param {string} text
 * @returns {{label: string, value: string}[] | null}
 */
export function numberedAnswerList (text) {
  if (!/^\d+\)\s+/.test(text)) return null;
  const entries = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const label = depth === 0 && (i === 0 || /[\s;,]/.test(text[i - 1])) && text.slice(i).match(/^(\d+)\)\s+/);
    if (label) {
      if (entries.length) entries.at(-1).value = text.slice(start, i).replace(/(?:\s+AND)?[\s;,]*$/i, '').trim();
      entries.push({ label: label[1], value: '' });
      i += label[0].length - 1;
      start = i + 1;
    } else if ('(['.includes(text[i])) depth++;
    else if (')]'.includes(text[i])) depth--;
  }
  entries.at(-1).value = text.slice(start).trim();
  return entries;
}
