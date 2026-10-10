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

  return renderExplicitMath(escapeHTML(token));
}

function renderExplicitMath (text, nesting = 0) {
  if (nesting >= 32) return text;
  let result = '';
  for (let index = 0; index < text.length; index++) {
    const marker = text[index];
    if (!['^', '_'].includes(marker)) {
      result += marker;
      continue;
    }
    let value;
    let end = index;
    if (text[index + 1] === '(') {
      let depth = 1;
      end = index + 2;
      while (end < text.length && depth) {
        if (text[end] === '(') depth++;
        if (text[end] === ')') depth--;
        end++;
      }
      value = text.slice(index + 2, end - 1);
      if (depth || !/^[\p{L}\p{N}+−=./→∞\u00a0()^_*×⋅,:-]+$/u.test(value)) value = undefined;
    } else if (marker === '^') {
      const match = text.slice(index).match(/^\^([+-]?\d+)(?![\w./])/);
      value = match?.[1];
      end = index + (match?.[0].length ?? 0);
    }
    if (value === undefined) {
      result += marker;
      continue;
    }
    const type = marker === '^' ? 'sup' : 'sub';
    const digits = type === 'sup' ? '⁰¹²³⁴⁵⁶⁷⁸⁹' : '₀₁₂₃₄₅₆₇₈₉';
    const signs = type === 'sup' ? { '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼' } : { '+': '₊', '-': '₋', '−': '₋', '=': '₌' };
    const letters = type === 'sub' ? { a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' } : {};
    const converted = [...value].map(char => /\d/.test(char) ? digits[Number(char)] : signs[char] ?? letters[char]);
    result += converted.every(char => char !== undefined) ? converted.join('') : `<${type}>${renderExplicitMath(value, nesting + 1)}</${type}>`;
    index = end - 1;
  }
  return result;
}
