import { escapeHTML } from './string-utils.js';

const SAFE_TAGS = new Set(['b', 'br', 'em', 'i', 'strong', 'sub', 'sup']);
const TOKEN_REGEX = /(<[^<>]*>|&(?:#[0-9]+|#x[\da-f]+|[a-z][a-z0-9]+);)/gi;

/**
 * Safely renders one progressively-read token or a complete question fragment.
 * Explicit presentation markup and character references are kept, while all
 * other HTML is escaped. This allows imported math such as x<sup>2</sup> and
 * chemistry such as H<sub>2</sub>O to retain their intended appearance.
 * @param {string} text
 * @param {{formatChoices?: boolean}} [options]
 * @returns {string}
 */
export function renderReadingText (text, { formatChoices = true } = {}) {
  if (typeof text !== 'string') return '';

  if (formatChoices) {
    text = text.replace(/(^|[ \t])([WXYZ]\))/g, '<br>$2');
  }

  const openSpans = [];
  return text
    .replace(/\n/g, '<br>')
    .split(TOKEN_REGEX)
    .map(token => renderToken(token, openSpans))
    .join('');
}

function renderToken (token, openSpans) {
  if (/^<span class=["']nsb-fraction["']>$/i.test(token)) {
    openSpans.push('fraction');
    return '<span class="nsb-fraction">';
  }

  if (/^<span>$/i.test(token) && openSpans.includes('fraction')) {
    openSpans.push('span');
    return '<span>';
  }

  if (/^<\/span>$/i.test(token) && openSpans.length) {
    openSpans.pop();
    return '</span>';
  }

  const tag = token.match(/^<\/?([a-z][a-z0-9]*)\s*(\/?)>$/i);
  if (tag && SAFE_TAGS.has(tag[1].toLowerCase())) {
    const name = tag[1].toLowerCase();
    if (name === 'br') return '<br>';
    return `<${token.startsWith('</') ? '/' : ''}${name}>`;
  }

  if (token.match(/^&(?:#[0-9]+|#x[\da-f]+|[a-z][a-z0-9]+);$/i)) {
    return token;
  }

  return escapeHTML(token);
}
